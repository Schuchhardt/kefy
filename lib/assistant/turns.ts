// ─── Turnos del chat del asistente ───────────────────────────────────────────
//
// Un turno = un mensaje del usuario = un mensaje de la cuota mensual del
// asistente (checkAiSpend 'assistant_message'). El turno acota cuántas
// llamadas al modelo caben en ese mensaje, también a través de las
// confirmaciones: la reanudación tras confirmar una acción gasta del mismo
// presupuesto, no abre uno nuevo.
//
// Cliente service-role sin RLS: toda consulta filtra por org_id a mano.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';

/** Llamadas al modelo que cubre un mensaje del usuario, reanudaciones incluidas. */
export const MAX_MODEL_CALLS_PER_TURN = 6;

export type TurnStatus = 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'aborted';

const ROUTE = 'lib/assistant/turns';

export async function createTurn({
  conversationId,
  orgId,
  userId,
}: {
  conversationId: string;
  orgId: string;
  userId: string;
}): Promise<{ id: string }> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_turns')
    .insert({
      conversation_id: conversationId,
      org_id: orgId,
      user_id: userId,
      max_model_calls: MAX_MODEL_CALLS_PER_TURN,
      // El mensaje sale de la cuota del asistente, no de los créditos de IA.
      credits_charged: 0,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo crear el turno: ${error?.message ?? 'sin fila'}`);
  }
  return { id: (data as { id: string }).id };
}

/** stepTurn: la RPC falló (distinto del tope agotado, -1). */
export const STEP_UNAVAILABLE = -2;

/**
 * Reserva una llamada al modelo dentro del turno (RPC atómica). Devuelve el
 * número de llamadas tras reservar, -1 si el turno agotó su tope o
 * STEP_UNAVAILABLE (-2) si la RPC falló.
 *
 * **Falla cerrado**: todo valor negativo niega la llamada, porque sin poder
 * contar no se autoriza otra llamada al modelo. El -2 separa un fallo nuestro
 * del tope, para no cobrar ni mostrar «límite de pasos» por una caída de la base.
 */
export async function stepTurn(turnId: string, orgId: string): Promise<number> {
  try {
    const db = createSupabaseServer();
    const { data, error } = await db.rpc('kefy_assistant_turn_step', {
      p_turn_id: turnId,
      p_org_id: orgId,
    });
    if (error) throw new Error(error.message);
    const n = typeof data === 'number' ? data : Number(data);
    return Number.isFinite(n) ? n : -1;
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'supabase', extra: { turnId, orgId, operacion: 'step' } });
    return STEP_UNAVAILABLE;
  }
}

export interface TurnUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Suma los tokens de una llamada al turno. Best-effort (leer, sumar, escribir):
 * es para vigilar el coste, no para cobrar, así que no lanza.
 */
export async function addTurnUsage(turnId: string, orgId: string, usage: TurnUsage | null | undefined): Promise<void> {
  if (!usage) return;
  try {
    const db = createSupabaseServer();
    const { data, error } = await db
      .from('kefy_assistant_turns')
      .select('input_tokens, output_tokens, cache_read_tokens')
      .eq('id', turnId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return;

    const cur = data as { input_tokens: number | string; output_tokens: number | string; cache_read_tokens: number | string };
    // input_tokens de Anthropic excluye lo leído y lo escrito en caché: se suma
    // la escritura para que el total refleje lo que se facturó a precio completo.
    const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

    const { error: upError } = await db
      .from('kefy_assistant_turns')
      .update({
        input_tokens: Number(cur.input_tokens) + input,
        output_tokens: Number(cur.output_tokens) + (usage.output_tokens ?? 0),
        cache_read_tokens: Number(cur.cache_read_tokens) + (usage.cache_read_input_tokens ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', turnId)
      .eq('org_id', orgId);
    if (upError) throw new Error(upError.message);
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'supabase', extra: { turnId, operacion: 'usage' } });
  }
}

/** Cambia el estado del turno. No lanza: el turno ya terminó o sigue igual. */
export async function setTurnStatus(turnId: string, orgId: string, status: TurnStatus): Promise<void> {
  try {
    const db = createSupabaseServer();
    const { error } = await db
      .from('kefy_assistant_turns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', turnId)
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'supabase', extra: { turnId, status, operacion: 'status' } });
  }
}

/**
 * Reclama un turno en pausa para reanudarlo (awaiting_confirmation → running).
 * Atómico: si dos confirmaciones del mismo mensaje terminan a la vez, solo una
 * reanuda el turno; la otra ve `false` y no vuelve a añadir los resultados.
 * Un turno cerrado porque el usuario escribió otro mensaje tampoco se reanuda.
 */
export async function claimTurnForResume(turnId: string, orgId: string): Promise<boolean> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_turns')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', turnId)
    .eq('org_id', orgId)
    .eq('status', 'awaiting_confirmation')
    .select('id')
    .maybeSingle();
  if (error) {
    reportError(new Error(error.message), { route: ROUTE, service: 'supabase', extra: { turnId, operacion: 'claim' } });
    return false;
  }
  return !!data;
}

/**
 * Cierra los turnos en pausa de una conversación (el usuario escribió un
 * mensaje nuevo en vez de confirmar). Así una confirmación tardía de otra
 * pestaña no puede reanudarlos después.
 */
export async function closeAwaitingTurns(conversationId: string, orgId: string): Promise<void> {
  try {
    const db = createSupabaseServer();
    const { error } = await db
      .from('kefy_assistant_turns')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('org_id', orgId)
      .eq('status', 'awaiting_confirmation');
    if (error) throw new Error(error.message);
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'supabase', extra: { conversationId, operacion: 'close_awaiting' } });
  }
}
