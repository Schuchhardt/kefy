import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthFromRequest } from '@/lib/auth';
import { getActiveBrandById } from '@/lib/brands';
import { getAssistantUsage } from '@/lib/usage';
import { reportError } from '@/lib/observability';
import { msg } from '@/lib/services/errors';
import { chatToolContext } from '@/lib/assistant/context';
import { claimPendingAction, completeAction, rejectAction, type ActionRow } from '@/lib/assistant/audit';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { getConversation, historyMinSeq, isTainted } from '@/lib/assistant/conversations';
import { setTurnStatus } from '@/lib/assistant/turns';
import { resumeAfterDecision } from '@/lib/assistant/agent';
import { createSseStream } from '@/lib/assistant/sse';

export const runtime = 'nodejs';
// Confirmar puede ejecutar una herramienta lenta (carrusel) y reanudar el turno.
export const maxDuration = 300;

const ROUTE = 'POST /api/assistant/actions/[actionId]';

const bodySchema = z.object({ decision: z.enum(['confirm', 'reject']) });

// ─── POST /api/assistant/actions/[actionId]?lang=es|en ───────────────────────
// Confirma o rechaza una acción que el asistente dejó pendiente. Responde SSE
// (mismos eventos que /api/assistant/chat): el resultado de la acción y, si ya
// no queda nada pendiente en ese mensaje, la continuación del turno.
//
// Sin guardAiRequest a propósito: las llamadas al modelo de la reanudación
// salen del presupuesto del turno (stepTurn) que pagó el mensaje original, y
// las herramientas que generan cobran sus créditos por su cuenta.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { actionId } = await params;
  const lang: 'es' | 'en' = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'es';

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
  const { decision } = parsed.data;

  const notPending = () => NextResponse.json(
    { error: msg(lang, 'Esta acción ya no está pendiente.', 'This action is no longer pending.'), code: 'not_pending' },
    { status: 409 },
  );

  if (!z.uuid().safeParse(actionId).success) return notPending();

  ensureToolsRegistered();

  // Reclamar / rechazar es un UPDATE condicionado al estado: cubre la acción
  // de otro usuario, la vencida y el doble clic.
  const who = { orgId: auth.orgId, userId: auth.userId };
  const action: ActionRow | null = decision === 'confirm'
    ? await claimPendingAction(actionId, who)
    : await rejectAction(actionId, who, 'user');
  if (!action) return notPending();

  // Una acción reclamada que no se puede ejecutar se cierra como fallida: si
  // no, quedaría en 'running' y el turno no se podría reanudar.
  const abandon = async (reason: string) => {
    if (decision === 'confirm') {
      await completeAction(action.id, 'failed', { ok: false, error: { code: 'conflict', status: 409, message: reason } }, reason, auth.orgId);
    }
    return notPending();
  };

  let conv;
  let tainted = false;
  try {
    conv = action.conversation_id
      ? await getConversation(action.conversation_id, auth.orgId, auth.userId)
      : null;
    if (conv) tainted = isTainted(conv, await historyMinSeq(conv.id, auth.orgId, auth.userId));
  } catch (err) {
    reportError(err, { route: ROUTE, auth, service: 'supabase' });
    conv = null;
  }
  if (!conv) return abandon('Conversation not found');

  const brand = action.brand_id ? await getActiveBrandById(action.brand_id, auth.orgId) : null;
  if (!brand) return abandon('Brand not found or archived');

  const ctx = chatToolContext({
    auth,
    brandId: brand.id,
    language: lang,
    conversationId: conv.id,
    turnId: action.turn_id ?? undefined,
    tainted,
  });

  const sse = createSseStream(req.signal);
  const conversation = conv;
  const turnId = action.turn_id;
  let resumed = false;

  void (async () => {
    try {
      sse.send({ type: 'message_start', conversationId: conversation.id, turnId: turnId ?? '' });
      const reason = await resumeAfterDecision({
        ctx,
        conv: conversation,
        action,
        decision,
        send: sse.send,
        signal: req.signal,
        onResumed: () => { resumed = true; },
      });
      // Solo quien reanudó el turno decide su estado; si otra petición lo
      // reanudó (o sigue en pausa por otra acción), no se toca. Si volvió a
      // pausarse, runAgentLoop ya lo dejó en awaiting_confirmation.
      if (resumed && turnId && reason !== 'awaiting_confirmation') {
        await setTurnStatus(turnId, auth.orgId, reason === 'aborted' ? 'aborted' : 'completed');
      }
      const usage = await getAssistantUsage(auth.orgId, auth.plan).catch(() => null);
      sse.send({
        type: 'done',
        reason,
        usage: usage ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : undefined,
      });
    } catch (err) {
      reportError(err, { route: ROUTE, auth, service: 'anthropic', extra: { actionId: action.id, turnId } });
      if (resumed && turnId) await setTurnStatus(turnId, auth.orgId, 'failed');
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

  return sse.response();
}
