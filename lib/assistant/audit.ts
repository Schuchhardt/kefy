// ─── Acciones del asistente: confirmación y auditoría ────────────────────────
//
// kefy_assistant_actions guarda dos cosas:
//   * Las confirmaciones pendientes del chat (pending_confirmation, con
//     expires_at). Confirmar es un UPDATE atómico condicionado al estado: dos
//     clics o dos pestañas no pueden ejecutar la misma acción dos veces.
//   * La auditoría de toda acción con efectos, venga del chat, del MCP o de la
//     API (running → succeeded | failed), y la idempotencia de la API.
//
// Cliente service-role sin RLS: toda consulta filtra por org_id a mano.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { Source, ToolKind } from '@/lib/assistant/types';

export type ActionStatus =
  | 'pending_confirmation'
  | 'rejected'
  | 'expired'
  | 'running'
  | 'succeeded'
  | 'failed';

export interface ActionRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  user_id: string | null;
  api_key_id: string | null;
  conversation_id: string | null;
  turn_id: string | null;
  message_id: string | null;
  tool_use_id: string | null;
  tool_name: string;
  source: Source;
  kind: ToolKind;
  input: Record<string, unknown>;
  status: ActionStatus;
  result: unknown;
  tool_result: ToolResultBlock | null;
  error: string | null;
  credits_estimated: number;
  idempotency_key: string | null;
  idempotency_hash: string | null;
  created_at: string;
  decided_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

/** Bloque tool_result de Anthropic, tal como se reenvía al reanudar el turno. */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type NewActionRow = {
  org_id: string;
  tool_name: string;
  source: Source;
  kind: ToolKind;
  status: ActionStatus;
  brand_id?: string | null;
  user_id?: string | null;
  api_key_id?: string | null;
  conversation_id?: string | null;
  turn_id?: string | null;
  message_id?: string | null;
  tool_use_id?: string | null;
  input?: Record<string, unknown>;
  result?: unknown;
  tool_result?: ToolResultBlock | null;
  credits_estimated?: number;
  idempotency_key?: string | null;
  idempotency_hash?: string | null;
  expires_at?: string | null;
};

/** Minutos que una confirmación pendiente sigue siendo válida. */
export const CONFIRMATION_TTL_MINUTES = 30;

const REJECT_MESSAGES = {
  user: 'The user declined this action.',
  superseded: 'The user did not confirm this action and sent a new message instead.',
} as const;

const EXPIRED_MESSAGE = 'Confirmation expired.';

function errorBlock(toolUseId: string | null, content: string): ToolResultBlock {
  return { type: 'tool_result', tool_use_id: toolUseId ?? '', is_error: true, content };
}

export async function createAction(row: NewActionRow): Promise<{ id: string }> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .insert(row)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo registrar la acción: ${error?.message ?? 'sin fila'}`);
  }
  return { id: (data as { id: string }).id };
}

/**
 * Cierra una acción con su resultado. No lanza: la acción ya ocurrió, y un
 * fallo de la auditoría no puede convertirla en un error para el usuario.
 */
export async function completeAction(
  id: string,
  status: 'succeeded' | 'failed',
  result: unknown,
  error?: string,
  orgId?: string,
): Promise<void> {
  try {
    const db = createSupabaseServer();
    let q = db
      .from('kefy_assistant_actions')
      .update({
        status,
        result,
        error: error ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (orgId) q = q.eq('org_id', orgId);
    const { error: dbError } = await q;
    if (dbError) throw new Error(dbError.message);
  } catch (err) {
    reportError(err, { route: 'lib/assistant/audit', service: 'supabase', extra: { actionId: id, status } });
  }
}

/**
 * Marca como expiradas las confirmaciones pendientes vencidas, cada una con su
 * tool_result de error para poder reanudar el turno. No lanza.
 */
export async function expirePendingActions(orgId: string, userId?: string): Promise<number> {
  try {
    const db = createSupabaseServer();
    const nowIso = new Date().toISOString();

    let q = db
      .from('kefy_assistant_actions')
      .select('id, tool_use_id')
      .eq('org_id', orgId)
      .eq('status', 'pending_confirmation')
      .lt('expires_at', nowIso);
    if (userId) q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ id: string; tool_use_id: string | null }>;
    let expired = 0;
    for (const row of rows) {
      const { error: upError } = await db
        .from('kefy_assistant_actions')
        .update({
          status: 'expired',
          decided_at: nowIso,
          completed_at: nowIso,
          tool_result: errorBlock(row.tool_use_id, EXPIRED_MESSAGE),
        })
        .eq('id', row.id)
        .eq('org_id', orgId)
        .eq('status', 'pending_confirmation');
      if (!upError) expired += 1;
    }
    return expired;
  } catch (err) {
    reportError(err, { route: 'lib/assistant/audit', service: 'supabase', extra: { orgId, operacion: 'expire' } });
    return 0;
  }
}

/**
 * Reclama una confirmación pendiente para ejecutarla. Atómico: el UPDATE solo
 * afecta a la fila si sigue pendiente y sin vencer, así que de dos peticiones
 * simultáneas solo una la obtiene. `null` = ya no está pendiente (otro usuario,
 * vencida, ya decidida).
 */
export async function claimPendingAction(
  id: string,
  { orgId, userId }: { orgId: string; userId: string },
): Promise<ActionRow | null> {
  await expirePendingActions(orgId, userId);

  const db = createSupabaseServer();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .update({ status: 'running', decided_at: nowIso })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .gt('expires_at', nowIso)
    .select('*')
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/assistant/audit', service: 'supabase', extra: { actionId: id, operacion: 'claim' },
    });
    return null;
  }
  return (data as ActionRow | null) ?? null;
}

/**
 * Rechaza una confirmación pendiente y deja preparado su tool_result de error.
 * Mismo UPDATE condicionado que claimPendingAction. `null` = ya no estaba
 * pendiente.
 */
export async function rejectAction(
  id: string,
  { orgId, userId }: { orgId: string; userId: string },
  reason: 'user' | 'superseded',
): Promise<ActionRow | null> {
  const db = createSupabaseServer();

  // El tool_result necesita el tool_use_id de la fila, que hay que leer antes.
  const { data: current } = await db
    .from('kefy_assistant_actions')
    .select('id, tool_use_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .maybeSingle();
  if (!current) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .update({
      status: 'rejected',
      decided_at: nowIso,
      completed_at: nowIso,
      tool_result: errorBlock((current as { tool_use_id: string | null }).tool_use_id, REJECT_MESSAGES[reason]),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .select('*')
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/assistant/audit', service: 'supabase', extra: { actionId: id, operacion: 'reject' },
    });
    return null;
  }
  return (data as ActionRow | null) ?? null;
}

/**
 * Inserta una acción con Idempotency-Key. Si la clave ya existe para esa API
 * key (violación de unicidad 23505), devuelve la fila existente en `existing`
 * para que el registro decida: mismo payload → repetir el resultado; otro
 * payload → 422; aún corriendo → 409.
 */
export async function insertIdempotentAction(
  row: NewActionRow & { api_key_id: string; idempotency_key: string; idempotency_hash: string },
): Promise<{ row: ActionRow; existing?: ActionRow }> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .insert(row)
    .select('*')
    .single();

  if (!error && data) return { row: data as ActionRow };

  if (error?.code === '23505') {
    const { data: existing, error: selError } = await db
      .from('kefy_assistant_actions')
      .select('*')
      .eq('org_id', row.org_id)
      .eq('api_key_id', row.api_key_id)
      .eq('idempotency_key', row.idempotency_key)
      .maybeSingle();
    if (existing) return { row: existing as ActionRow, existing: existing as ActionRow };
    throw new Error(`No se pudo leer la acción idempotente: ${selError?.message ?? 'sin fila'}`);
  }

  throw new Error(`No se pudo registrar la acción: ${error?.message ?? 'sin fila'}`);
}

/**
 * Plazo de una fila idempotente en 'running' (en `expires_at`). Las rutas de la
 * API y del MCP mueren a los 300 s (maxDuration): pasado este plazo nadie la va
 * a cerrar, y un reintento con la misma clave puede retomarla.
 */
export const IDEMPOTENCY_LEASE_MS = 10 * 60_000;

/** Nuevo vencimiento del plazo de una fila idempotente en 'running'. */
export const idempotencyLeaseExpiry = (now = Date.now()): string =>
  new Date(now + IDEMPOTENCY_LEASE_MS).toISOString();

/** Una fila idempotente en 'running' cuyo plazo ya venció (el proceso murió). */
export function isAbandonedRun(row: Pick<ActionRow, 'status' | 'expires_at' | 'created_at'>, now = Date.now()): boolean {
  if (row.status !== 'running') return false;
  const deadline = row.expires_at
    ? Date.parse(row.expires_at)
    : Date.parse(row.created_at) + IDEMPOTENCY_LEASE_MS;
  return Number.isFinite(deadline) && deadline <= now;
}

/**
 * Retoma una fila idempotente para volver a ejecutarla con la misma clave: una
 * que falló por algo pasajero (sin créditos, rate limit, proveedor caído) o una
 * que quedó en 'running' porque el proceso murió. Se reutiliza la misma fila
 * (y su id, base del request_id de Zernio: un reintento de publicación no
 * duplica lo que ya salió). UPDATE condicionado al estado que se leyó: de dos
 * reintentos simultáneos solo uno la obtiene. `false` = otro se adelantó.
 */
export async function reclaimIdempotentAction(existing: ActionRow): Promise<boolean> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_assistant_actions')
    .update({
      status: 'running',
      result: null,
      error: null,
      completed_at: null,
      expires_at: idempotencyLeaseExpiry(),
    })
    .eq('id', existing.id)
    .eq('org_id', existing.org_id)
    .eq('status', existing.status);
  q = existing.expires_at ? q.eq('expires_at', existing.expires_at) : q.is('expires_at', null);

  const { data, error } = await q.select('id');
  if (error) throw new Error(`No se pudo retomar la acción idempotente: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Acciones de un mensaje del asistente, en orden de creación. */
export async function listActionsForMessage(messageId: string, orgId: string): Promise<ActionRow[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .select('*')
    .eq('message_id', messageId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron leer las acciones: ${error.message}`);
  return (data ?? []) as ActionRow[];
}

/** Guarda el tool_result ya preparado de una acción (para reanudar el turno). */
export async function storeActionResult(
  id: string,
  toolResultBlock: ToolResultBlock,
  orgId?: string,
): Promise<void> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_assistant_actions')
    .update({ tool_result: toolResultBlock })
    .eq('id', id);
  if (orgId) q = q.eq('org_id', orgId);
  const { error } = await q;
  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/assistant/audit', service: 'supabase', extra: { actionId: id, operacion: 'store_result' },
    });
  }
}
