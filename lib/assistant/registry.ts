// ─── Registro de acciones del asistente ──────────────────────────────────────
//
// Un único motor y tres puertas: el chat del dashboard, la API REST (/api/v1)
// y el servidor MCP (/api/mcp) ejecutan las herramientas por aquí, con
// executeTool(). Las herramientas son finas: validan la entrada con zod y
// llaman a los servicios de lib/services/*, que son los mismos que usan las
// rutas de la UI.
//
// executeTool concentra las reglas que no pueden depender de cada herramienta:
// marca, validación, scopes, rol, suscripción, rate limit de publicación,
// confirmación humana en el chat, idempotencia de la API y auditoría.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OrgRole } from '@/lib/team';
import { checkSubscription } from '@/lib/subscription';
import { checkRateLimit, publishRule, rateLimitBody, rateLimitHeaders } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import { ServiceError, msg } from '@/lib/services/errors';
import { resolveBrandForContext } from '@/lib/assistant/context';
import {
  createAction, completeAction, insertIdempotentAction, reclaimIdempotentAction, isAbandonedRun,
  idempotencyLeaseExpiry, CONFIRMATION_TTL_MINUTES,
} from '@/lib/assistant/audit';
import { summarizeTool } from '@/lib/assistant/summaries';
import { truncateJson } from '@/lib/assistant/untrusted';
import type {
  Source, ToolContext, ToolErrorBody, ToolKind, ToolResult, ToolSuccess,
} from '@/lib/assistant/types';

/** Desde cuántos créditos estimados una acción del chat pide confirmación. */
export const CONFIRM_CREDIT_THRESHOLD = 10;

/** Tope del resultado guardado en kefy_assistant_actions. */
const MAX_STORED_RESULT_BYTES = 65536;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ToolDef<S extends z.ZodObject<any>> {
  /** snake_case, único. */
  name: string;
  /** Título legible, para la UI y como resumen de respaldo. */
  title?: { es: string; en: string };
  kind: ToolKind;
  /** En inglés, escrito para el modelo: qué hace, cuándo usarla y cuántos créditos cuesta. */
  description: string;
  input: S;
  /** Por defecto, todos los roles. */
  roles?: OrgRole[];
  /** Por defecto, ['chat', 'mcp', 'api']. */
  sources?: Source[];
  /** true → toca datos de toda la organización; se rechaza con keys atadas a una marca. */
  orgWide?: boolean;
  confirm: 'never' | 'always' | ((ctx: ToolContext, input: z.infer<S>, preview?: Record<string, unknown>) => boolean);
  estimateCredits?: (input: z.infer<S>) => number;
  /** Si el resultado trae contenido de terceros que debe «contaminar» el turno. */
  taints?: 'always' | ((data: unknown) => boolean);
  /** Vista previa para la tarjeta de confirmación (título, usuarios, texto). */
  describe?: (ctx: ToolContext, input: z.infer<S>) => Promise<Record<string, unknown>>;
  /**
   * Lo que la persona aprueba en la tarjeta y que puede cambiar en la base de
   * datos antes del clic (p. ej. el texto que se va a publicar). Se guarda su
   * hash con la acción pendiente y, al confirmar, si ya no coincide la acción
   * falla con 409 content_changed en vez de ejecutarse sobre otro contenido.
   */
  snapshot?: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
  handler: (ctx: ToolContext, input: z.infer<S>) => Promise<Omit<ToolSuccess, 'ok'>>;
}

type AnyToolDef = ToolDef<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEFAULT_SOURCES: Source[] = ['chat', 'mcp', 'api'];
const registry = new Map<string, AnyToolDef>();

/** Identidad tipada: da inferencia de `input` en confirm/handler. */
export function defineTool<S extends z.ZodObject<any>>(def: ToolDef<S>): ToolDef<S> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return def;
}

/** Registra herramientas. Lanza si un nombre se repite. */
export function registerTools(defs: AnyToolDef[]): void {
  for (const def of defs) {
    if (registry.has(def.name)) {
      throw new Error(`Herramienta duplicada en el registro: ${def.name}`);
    }
    registry.set(def.name, def);
  }
}

export function getTool(name: string): AnyToolDef | undefined {
  return registry.get(name);
}

export function allToolNames(): string[] {
  return [...registry.keys()].sort();
}

/** Solo para tests: vacía el registro. */
export function __resetRegistryForTests(): void {
  registry.clear();
}

function allowsSource(def: AnyToolDef, source: Source): boolean {
  return (def.sources ?? DEFAULT_SOURCES).includes(source);
}

/**
 * Herramientas visibles para un llamador: por fuente, rol y (fuera del chat)
 * scopes de la API key. Ordenadas por nombre — el orden estable mantiene el
 * prefijo cacheado del prompt.
 */
export function listTools(
  ctx: Pick<ToolContext, 'source' | 'role' | 'scopes' | 'boundBrandId'>,
): AnyToolDef[] {
  return [...registry.values()]
    .filter((def) => allowsSource(def, ctx.source))
    .filter((def) => !def.roles || def.roles.includes(ctx.role))
    .filter((def) => ctx.source === 'chat' || ctx.scopes.includes(def.kind))
    .filter((def) => !(def.orgWide && ctx.boundBrandId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * JSON Schema de la entrada. Fuera del chat, y si la key no está atada a una
 * marca, se añade `brand_id` para que el cliente elija sobre qué marca actuar.
 */
export function toolJsonSchema(
  def: AnyToolDef,
  ctx: Pick<ToolContext, 'source' | 'boundBrandId'>,
): Record<string, unknown> {
  const s = z.toJSONSchema(def.input, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  delete s.$schema;

  if (ctx.source !== 'chat' && !ctx.boundBrandId) {
    const properties = { ...((s.properties as Record<string, unknown> | undefined) ?? {}) };
    properties.brand_id = {
      type: 'string',
      format: 'uuid',
      description: 'Brand to act on. Required when the org has several brands; see get_workspace_context.',
    };
    s.properties = properties;
  }
  if (!s.type) s.type = 'object';
  return s;
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

function fail(
  code: string,
  status: number,
  message: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): { ok: false; error: ToolErrorBody } {
  const error: ToolErrorBody = { code, status, message };
  if (body) error.body = body;
  if (headers) error.headers = headers;
  return { ok: false, error };
}

/**
 * Fallos pasajeros: con la misma Idempotency-Key se vuelven a ejecutar en vez
 * de repetir el error guardado (pasado el Retry-After, con créditos nuevos o
 * con el proveedor de vuelta, el mismo pedido puede salir bien).
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'rate_limited', 'credits_exhausted', 'subscription_required', 'unavailable', 'provider_error',
]);

export function isRetryableError(error: Pick<ToolErrorBody, 'code' | 'status'>): boolean {
  return RETRYABLE_CODES.has(error.code) || error.status === 429 || error.status >= 500;
}

function fromServiceError(err: ServiceError): { ok: false; error: ToolErrorBody } {
  return fail(err.code, err.status, err.message, err.body, err.headers);
}

/** JSON con las claves ordenadas: el mismo input da siempre el mismo hash. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * Hash de una petición idempotente. Incluye la marca resuelta: `brand_id` sale
 * de la entrada antes de validar, y sin él la misma key reutilizada con otra
 * marca devolvería el resultado de la primera en vez de un mismatch.
 */
export function idempotencyHash(name: string, input: unknown, brandId: string | null | undefined): string {
  return createHash('sha256').update(name + stableStringify({ brand_id: brandId || null, input })).digest('hex');
}

/** Hash del snapshot de una acción pendiente (ver ToolDef.snapshot). */
export function snapshotHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value ?? null)).digest('hex');
}

function needsConfirmation(
  def: AnyToolDef,
  ctx: ToolContext,
  input: unknown,
  preview: Record<string, unknown>,
  credits: number,
): boolean {
  if (def.confirm === 'always') return true;
  if (typeof def.confirm === 'function' && def.confirm(ctx, input, preview)) return true;
  if (credits >= CONFIRM_CREDIT_THRESHOLD) return true;
  // Con contenido no confiable en el historial, o si otra acción de este mismo
  // mensaje ya espera confirmación, toda escritura pasa por el humano.
  if (def.kind !== 'read' && (ctx.turn?.tainted || ctx.turn?.pausedInMessage)) return true;
  return false;
}

export interface ExecuteOptions {
  /** La acción ya fue confirmada por el usuario (chat). */
  confirmed?: boolean;
  /** Fila de kefy_assistant_actions ya reclamada con claimPendingAction. */
  claimedActionId?: string;
  /** Idempotency-Key de la API / MCP. */
  idempotencyKey?: string;
  /** id del bloque tool_use (chat). */
  toolUseId?: string;
  /**
   * Con `confirmed`: hash del snapshot que vio la persona en la tarjeta
   * (result.snapshot_hash de la acción pendiente). Si la herramienta define
   * `snapshot` y no coincide (o falta), no se ejecuta.
   */
  expectedSnapshotHash?: string | null;
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  opts: ExecuteOptions = {},
): Promise<ToolResult> {
  const lang = ctx.language;

  // a. Herramienta y fuente.
  const def = getTool(name);
  if (!def || !allowsSource(def, ctx.source)) {
    return fail('not_found', 404, `Unknown tool: ${name}`);
  }

  // Scopes de la API key, antes que la marca y la validación: una key sin el
  // scope no debe poder sondear el esquema de entrada a partir de los 422.
  if (ctx.source !== 'chat' && !ctx.scopes.includes(def.kind)) {
    return fail('scope_denied', 403, `This API key lacks the '${def.kind}' scope`);
  }

  // b. Marca (fuera del chat la elige el llamador con brand_id).
  let candidate: unknown = rawInput ?? {};
  if (ctx.source !== 'chat') {
    try {
      let requestedBrandId: string | undefined;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && 'brand_id' in candidate) {
        const { brand_id, ...rest } = candidate as Record<string, unknown>;
        candidate = rest;
        if (brand_id !== undefined && brand_id !== null) {
          if (typeof brand_id !== 'string') {
            return fail('invalid_input', 422, 'brand_id must be a string', {
              error: 'brand_id must be a string',
              issues: { formErrors: [], fieldErrors: { brand_id: ['Expected string'] } },
            });
          }
          requestedBrandId = brand_id;
        }
      }
      if (requestedBrandId || !ctx.brandId) {
        const brand = await resolveBrandForContext({
          orgId: ctx.orgId,
          boundBrandId: ctx.boundBrandId,
          requestedBrandId,
        });
        ctx.brandId = brand.id;
      }
    } catch (err) {
      if (err instanceof ServiceError) return fromServiceError(err);
      reportError(err, { route: `tool:${name}`, auth: ctx.auth, extra: { source: ctx.source, apiKeyId: ctx.apiKeyId } });
      return fail('unavailable', 503, msg(lang, 'No pudimos resolver la marca. Reintenta.', 'Could not resolve the brand. Try again.'));
    }
  }

  // c. Validación.
  const parsed = def.input.safeParse(candidate);
  if (!parsed.success) {
    const message = msg(lang, 'Entrada inválida', 'Invalid input');
    return fail('invalid_input', 422, message, { error: message, issues: z.flattenError(parsed.error) });
  }
  const input = parsed.data as Record<string, unknown>;

  // e. Rol.
  if (def.roles && !def.roles.includes(ctx.role)) {
    return fail('forbidden', 403, msg(lang, 'Tu rol no permite esta acción', 'Your role does not allow this action'));
  }

  // f. Datos de toda la organización con una key atada a una marca.
  if (def.orgWide && ctx.boundBrandId) {
    return fail('bound_key_org_write', 403, 'This API key is bound to a brand and cannot change organization-wide data');
  }

  // g. Suscripción (y rate limit de publicación) para todo lo que no es lectura.
  if (def.kind !== 'read') {
    const sub = await checkSubscription(ctx.orgId, lang);
    if (!sub.ok) {
      return fail(
        sub.status === 402 ? 'subscription_required' : 'unavailable',
        sub.status,
        String(sub.body.error),
        sub.body,
      );
    }

    if (def.kind === 'publish') {
      const limit = await checkRateLimit(publishRule(ctx.orgId));
      if (!limit.allowed) {
        const message = msg(
          lang,
          'Demasiadas publicaciones en poco tiempo. Espera un momento y reintenta.',
          'Too many publications in a short time. Wait a moment and try again.',
        );
        return fail('rate_limited', 429, message, rateLimitBody(limit, message), rateLimitHeaders(limit));
      }
    }
  }

  // h. Confirmación humana (solo chat).
  if (ctx.source === 'chat' && !opts.confirmed) {
    try {
      const preview = def.describe ? await def.describe(ctx, input) : {};
      const credits = def.estimateCredits?.(input) ?? 0;

      if (needsConfirmation(def, ctx, input, preview, credits)) {
        const summary = summarizeTool(name, lang, input, preview, def.title);
        const snapshot_hash = def.snapshot ? snapshotHash(await def.snapshot(ctx, input)) : undefined;
        const { id } = await createAction({
          org_id: ctx.orgId,
          brand_id: ctx.brandId || null,
          user_id: ctx.userId,
          conversation_id: ctx.conversationId ?? null,
          turn_id: ctx.turnId ?? null,
          message_id: ctx.messageId ?? null,
          tool_use_id: opts.toolUseId ?? null,
          tool_name: name,
          source: 'chat',
          kind: def.kind,
          input,
          status: 'pending_confirmation',
          // Mientras está pendiente, `result` guarda lo que la tarjeta de
          // confirmación necesita para volver a pintarse al recargar.
          result: { summary, preview, credits, ...(snapshot_hash ? { snapshot_hash } : {}) },
          credits_estimated: Math.max(0, Math.round(credits)),
          expires_at: new Date(Date.now() + CONFIRMATION_TTL_MINUTES * 60_000).toISOString(),
        });
        if (ctx.turn) ctx.turn.pausedInMessage = true;
        return { ok: 'pending', actionId: id, summary, preview, credits };
      }
    } catch (err) {
      if (err instanceof ServiceError) return fromServiceError(err);
      reportError(err, { route: `tool:${name}`, auth: ctx.auth, extra: { source: ctx.source, step: 'confirm' } });
      return fail('provider_error', 502, msg(lang, 'La acción falló. Inténtalo de nuevo.', 'The action failed. Try again.'));
    }
  }

  // h'. Lo confirmado sigue siendo lo que se va a ejecutar: si el contenido
  // cambió entre la tarjeta y el clic (otra pestaña, una API key), se corta.
  if (opts.confirmed && def.snapshot) {
    try {
      const current = snapshotHash(await def.snapshot(ctx, input));
      if (current !== opts.expectedSnapshotHash) {
        return fail('content_changed', 409, msg(
          lang,
          'El contenido cambió desde que lo confirmaste. Revísalo y vuelve a pedirlo.',
          'The content changed since you confirmed. Review it and ask again.',
        ));
      }
    } catch (err) {
      if (err instanceof ServiceError) return fromServiceError(err);
      reportError(err, { route: `tool:${name}`, auth: ctx.auth, extra: { source: ctx.source, step: 'snapshot' } });
      return fail('provider_error', 502, msg(lang, 'La acción falló. Inténtalo de nuevo.', 'The action failed. Try again.'));
    }
  }

  // i. Fila de auditoría (y de idempotencia) para todo lo que no es lectura.
  let actionId: string | undefined;
  if (def.kind !== 'read') {
    try {
      if (opts.claimedActionId) {
        actionId = opts.claimedActionId;
      } else if (opts.idempotencyKey && ctx.source !== 'chat' && ctx.apiKeyId) {
        const hash = idempotencyHash(name, input, ctx.brandId);
        const r = await insertIdempotentAction({
          org_id: ctx.orgId,
          brand_id: ctx.brandId || null,
          user_id: ctx.userId,
          api_key_id: ctx.apiKeyId,
          tool_name: name,
          source: ctx.source,
          kind: def.kind,
          input,
          status: 'running',
          idempotency_key: opts.idempotencyKey,
          idempotency_hash: hash,
          // Plazo de la ejecución: si el proceso muere, un reintento la retoma.
          expires_at: idempotencyLeaseExpiry(),
        });

        if (r.existing) {
          const ex = r.existing;
          if (ex.idempotency_hash !== hash) {
            return fail('idempotency_mismatch', 422, 'This Idempotency-Key was already used with a different request');
          }
          if (ex.status === 'succeeded') {
            const stored = ex.result as ToolSuccess | null;
            return stored && stored.ok === true ? stored : { ok: true, data: stored };
          }
          const storedError = ex.status === 'failed'
            ? ((ex.result as { error?: ToolErrorBody } | null)?.error
              ?? { code: 'provider_error' as const, status: 502, message: ex.error ?? 'The action failed' })
            : null;
          // Un fallo definitivo (validación, permisos, no encontrado) se repite
          // tal cual. Uno pasajero (sin créditos, rate limit, proveedor caído) o
          // una ejecución abandonada se retoman: si no, la clave quedaría
          // devolviendo ese error para siempre.
          const retry = (storedError && isRetryableError(storedError)) || isAbandonedRun(ex);
          if (!retry) {
            if (storedError) return { ok: false, error: storedError };
            return fail('idempotency_in_progress', 409, 'A request with this Idempotency-Key is still running');
          }
          if (!(await reclaimIdempotentAction(ex))) {
            return fail('idempotency_in_progress', 409, 'A request with this Idempotency-Key is still running');
          }
          actionId = ex.id;
        } else {
          actionId = r.row.id;
        }
      } else {
        const r = await createAction({
          org_id: ctx.orgId,
          brand_id: ctx.brandId || null,
          user_id: ctx.userId,
          api_key_id: ctx.apiKeyId ?? null,
          conversation_id: ctx.conversationId ?? null,
          turn_id: ctx.turnId ?? null,
          message_id: ctx.messageId ?? null,
          tool_use_id: opts.toolUseId ?? null,
          tool_name: name,
          source: ctx.source,
          kind: def.kind,
          input,
          status: 'running',
        });
        actionId = r.id;
      }
    } catch (err) {
      // Sin auditoría no se ejecuta una acción con efectos.
      reportError(err, { route: `tool:${name}`, auth: ctx.auth, extra: { source: ctx.source, step: 'audit' } });
      return fail('unavailable', 503, msg(lang, 'No pudimos registrar la acción. Reintenta en un momento.', 'Could not record the action. Try again in a moment.'));
    }
    // El handler ve el id de su fila: publish_content lo usa como base del
    // request_id que deduplica reintentos en Zernio (chat, API y MCP).
    if (actionId) ctx.actionId = actionId;
  }

  // j. Ejecución.
  try {
    const out = await def.handler(ctx, input);
    const res: ToolSuccess = { ok: true, ...out };
    if (def.taints === 'always' || (typeof def.taints === 'function' && def.taints(out.data))) {
      res.tainted = true;
      if (ctx.turn) ctx.turn.tainted = true;
    }
    if (actionId) await completeAction(actionId, 'succeeded', truncateJson(res, MAX_STORED_RESULT_BYTES), undefined, ctx.orgId);
    return res;
  } catch (err) {
    let result: { ok: false; error: ToolErrorBody };
    if (err instanceof ServiceError) {
      result = fromServiceError(err);
    } else {
      reportError(err, {
        route: `tool:${name}`,
        auth: ctx.auth,
        extra: { source: ctx.source, apiKeyId: ctx.apiKeyId },
      });
      result = fail('provider_error', 502, msg(lang, 'La acción falló. Inténtalo de nuevo.', 'The action failed. Try again.'));
    }
    if (actionId) {
      await completeAction(actionId, 'failed', truncateJson(result, MAX_STORED_RESULT_BYTES), result.error.message, ctx.orgId);
    }
    return result;
  }
}
