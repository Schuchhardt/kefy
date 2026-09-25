import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthFromRequest } from '@/lib/auth';
import { getActiveBrandById, getBrandFromRequest } from '@/lib/brands';
import { guardAiRequest } from '@/lib/ai-guard';
import { assistantRule } from '@/lib/rate-limit';
import { getAssistantUsage } from '@/lib/usage';
import { reportError } from '@/lib/observability';
import { ServiceError, msg } from '@/lib/services/errors';
import { chatToolContext } from '@/lib/assistant/context';
import { expirePendingActions, rejectAction } from '@/lib/assistant/audit';
import { buildWorkspaceSnapshot, ensureToolsRegistered } from '@/lib/assistant/tools';
import {
  appendMessage, buildSnapshotBlock, createConversation, getConversation, getLastMessage,
  listPendingActions, loadBrandData, markTainted, type ConversationRow,
} from '@/lib/assistant/conversations';
import { closeAwaitingTurns, createTurn, setTurnStatus } from '@/lib/assistant/turns';
import { buildToolResultsForMessage, runAgentLoop } from '@/lib/assistant/agent';
import { createSseStream } from '@/lib/assistant/sse';
import type { ToolResultBlock } from '@/lib/assistant/audit';

export const runtime = 'nodejs';
// Un turno puede encadenar hasta 6 llamadas al modelo y herramientas lentas
// (un carrusel con imágenes). Ver también vercel.json.
export const maxDuration = 300;

const ROUTE = 'POST /api/assistant/chat';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  language: z.enum(['es', 'en']).default('es'),
  /** Ruta del dashboard en la que está el usuario (contexto para el modelo). */
  page: z.string().max(200).optional(),
  /** Zona horaria IANA del navegador, para interpretar «el lunes a las 9». */
  timezone: z.string().max(64).optional(),
});

// ─── POST /api/assistant/chat ─────────────────────────────────────────────────
// Un mensaje del usuario al asistente. Todo lo que puede fallar antes de
// empezar (auth, validación, marca, conversación, guardia) responde JSON; a
// partir de ahí la respuesta es un stream SSE (lib/assistant/sse.ts) con los
// eventos de SseEvent (lib/assistant/types.ts).
//
// Cada mensaje descuenta 1 de la cuota mensual de mensajes del asistente
// (guardAiRequest con 'assistant_message', no gasta créditos de IA) y abre un
// turno con hasta MAX_MODEL_CALLS_PER_TURN llamadas al modelo. Si el turno
// falla antes de que el modelo responda nada, el mensaje se devuelve.

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: z.flattenError(parsed.error) },
      { status: 422 },
    );
  }
  const body = parsed.data;
  const lang = body.language;

  // Marca: la pedida (si es de la org y no está archivada) o la activa.
  let brandId: string;
  let setCookieHeader: string | undefined;
  if (body.brandId) {
    const brand = await getActiveBrandById(body.brandId, auth.orgId);
    if (!brand) return NextResponse.json({ error: msg(lang, 'Marca no encontrada', 'Brand not found') }, { status: 404 });
    brandId = brand.id;
  } else {
    const r = await getBrandFromRequest(req, auth);
    if (!r.brand) return NextResponse.json({ error: msg(lang, 'Marca no encontrada', 'Brand not found') }, { status: 404 });
    brandId = r.brand.id;
    setCookieHeader = r.setCookieHeader;
  }

  // Conversación existente (de este usuario). Si es nueva, se crea después de
  // la guardia: una petición bloqueada no deja nada creado.
  let conv: ConversationRow | null = null;
  try {
    if (body.conversationId) {
      conv = await getConversation(body.conversationId, auth.orgId, auth.userId);
      if (!conv) {
        return NextResponse.json(
          { error: msg(lang, 'Conversación no encontrada', 'Conversation not found') },
          { status: 404 },
        );
      }
    }
  } catch (err) {
    reportError(err, { route: ROUTE, auth, service: 'supabase' });
    return NextResponse.json({ error: msg(lang, 'Error interno', 'Internal error') }, { status: 500 });
  }

  await expirePendingActions(auth.orgId, auth.userId);

  // Guardia única de gasto (AGENTS.md): suscripción → rate limit del
  // asistente → cuota mensual de mensajes.
  const guard = await guardAiRequest(req, {
    auth,
    operation: 'assistant_message',
    route: ROUTE,
    language: lang,
    rateRule: assistantRule(auth.orgId),
  });
  if (guard.blocked) return guard.blocked;

  // ─── Preparación del turno (todavía JSON si falla) ─────────────────────────
  let turnId: string;
  try {
    ensureToolsRegistered();

    if (!conv) conv = await createConversation({ orgId: auth.orgId, userId: auth.userId, brandId });

    // Confirmaciones sin decidir: el usuario siguió escribiendo. Se rechazan,
    // se cierra el turno que esperaba y sus resultados van delante del mensaje
    // nuevo, para que cada tool_use del historial tenga su tool_result.
    const pending = await listPendingActions(conv.id, auth.orgId, auth.userId);
    for (const a of pending) {
      await rejectAction(a.id, { orgId: auth.orgId, userId: auth.userId }, 'superseded');
    }
    await closeAwaitingTurns(conv.id, auth.orgId);

    let prefix: ToolResultBlock[] = [];
    let prefixTainted = false;
    const last = await getLastMessage(conv.id, auth.orgId, auth.userId);
    if (last?.role === 'assistant' && last.content.some((b) => b.type === 'tool_use')) {
      const agg = await buildToolResultsForMessage(last.id, auth.orgId, { finalize: true });
      prefix = agg.blocks;
      prefixTainted = agg.tainted;
    }

    turnId = (await createTurn({ conversationId: conv.id, orgId: auth.orgId, userId: auth.userId })).id;

    const ctx = chatToolContext({
      auth, brandId, language: lang, conversationId: conv.id, turnId, timezone: body.timezone, tainted: false,
    });

    // El snapshot se guarda con el mensaje y nunca se regenera (prefijo estable
    // para la caché).
    const [snapshot, brandData] = await Promise.all([buildWorkspaceSnapshot(ctx), loadBrandData(brandId)]);
    const snapshotBlock = buildSnapshotBlock(snapshot, {
      pagePath: body.page ?? null,
      timezone: body.timezone ?? null,
      nowIso: new Date().toISOString(),
      brandData,
    });

    const saved = await appendMessage({
      conversationId: conv.id,
      orgId: auth.orgId,
      userId: auth.userId,
      turnId,
      role: 'user',
      content: [...prefix, { type: 'text', text: body.message }, snapshotBlock],
      text: body.message,
    });
    if (prefixTainted) {
      await markTainted(conv.id, auth.orgId, saved.seq);
      conv.tainted_through_seq = Math.max(conv.tainted_through_seq ?? 0, saved.seq);
    }

    // ─── Stream ──────────────────────────────────────────────────────────────
    const sse = createSseStream(req.signal);
    const conversation = conv;
    let assistantPersisted = false;

    void (async () => {
      try {
        sse.send({ type: 'message_start', conversationId: conversation.id, turnId });
        const reason = await runAgentLoop({
          ctx,
          conv: conversation,
          turnId,
          send: sse.send,
          signal: req.signal,
          onAssistantPersisted: () => { assistantPersisted = true; },
        });
        // Terminó sin que el modelo respondiera nada (el cliente se fue antes
        // de la primera llamada): el mensaje no se gasta.
        if (!assistantPersisted) await guard.refund();
        // En pausa, runAgentLoop ya dejó el turno en awaiting_confirmation
        // antes de emitir las confirmaciones; volver a escribirlo aquí podría
        // pisar la reanudación de una confirmación que llegó entre medias.
        if (reason !== 'awaiting_confirmation') {
          await setTurnStatus(turnId, auth.orgId, reason === 'aborted' ? 'aborted' : 'completed');
        }
        const usage = await getAssistantUsage(auth.orgId, auth.plan).catch(() => null);
        sse.send({
          type: 'done',
          reason,
          usage: usage ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : undefined,
        });
      } catch (err) {
        // Un fallo nuestro (o del proveedor) antes de que el modelo respondiera
        // nada no gasta el mensaje del usuario.
        if (!assistantPersisted) await guard.refund();
        // Un ServiceError ya reportado (p. ej. stepTurn sin base) no se repite.
        if (!(err instanceof ServiceError && err.reported)) {
          reportError(err, { route: ROUTE, auth, service: 'anthropic', extra: { turnId, conversationId: conversation.id } });
        }
        await setTurnStatus(turnId, auth.orgId, 'failed');
        sse.send({
          type: 'error',
          code: 'provider_error',
          message: msg(lang, 'El asistente tuvo un problema. Inténtalo de nuevo.', 'The assistant ran into a problem. Try again.'),
        });
        sse.send({ type: 'done' });
      } finally {
        sse.close();
      }
    })();

    return sse.response({ headers: setCookieHeader ? { 'Set-Cookie': setCookieHeader } : {} });
  } catch (err) {
    await guard.refund();
    reportError(err, { route: ROUTE, auth, service: 'supabase' });
    return NextResponse.json(
      { error: msg(lang, 'No pudimos iniciar la conversación. Inténtalo de nuevo.', 'Could not start the conversation. Try again.') },
      { status: 500 },
    );
  }
}
