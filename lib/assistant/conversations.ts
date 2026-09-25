// ─── Conversaciones del asistente ────────────────────────────────────────────
//
// kefy_assistant_messages guarda los bloques de Anthropic TAL CUAL (text,
// thinking, tool_use, tool_result y cualquier tipo nuevo) para poder reenviar
// el historial exacto en cada llamada: los bloques thinking tienen que volver
// sin tocar, y un prefijo idéntico byte a byte es lo que hace funcionar la
// caché de prompts. Por eso el historial es solo-anexar: nunca se edita un
// mensaje ya guardado; las reparaciones se hacen añadiendo mensajes nuevos.
//
// Todas las consultas filtran por org_id Y user_id: una conversación es de
// quien la empezó, no de toda la organización.

import type Anthropic from '@anthropic-ai/sdk';
import { createSupabaseServer } from '@/lib/supabase';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import { wrapUntrusted } from '@/lib/assistant/untrusted';
import type { ActionRow, ToolResultBlock } from '@/lib/assistant/audit';
import type { ToolLink } from '@/lib/assistant/types';
import type { WorkspaceSnapshot } from '@/lib/assistant/tools';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ConversationRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  user_id: string;
  title: string | null;
  tainted_through_seq: number | null;
  last_message_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  turn_id: string | null;
  seq: number;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  text: string | null;
  model: string | null;
  stop_reason: string | null;
  created_at: string;
}

/** Bloque guardado. Se tipa suelto a propósito: los tipos desconocidos pasan sin tocar. */
export type ContentBlock = { type: string; [key: string]: unknown };

export type DisplayToolStatus = 'done' | 'error' | 'pending' | 'rejected' | 'expired';

export interface DisplayTool {
  toolUseId: string;
  name: string;
  status: DisplayToolStatus;
  links?: ToolLink[];
  /** Mensaje del error, si la herramienta falló. */
  error?: string;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  tools: DisplayTool[];
}

export interface PendingActionView {
  actionId: string;
  toolUseId: string | null;
  name: string;
  summary: string;
  preview: Record<string, unknown>;
  credits: number;
  expiresAt: string;
}

export interface ConversationListItem {
  id: string;
  title: string | null;
  last_message_at: string;
  brand_id: string | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Mensajes del historial que se reenvían al modelo. */
export const HISTORY_LIMIT = 30;
/** Mensajes que se cargan para pintar una conversación. */
const DISPLAY_LIMIT = 200;
const TITLE_MAX = 60;

const INTERRUPTED = 'Interrupted before completion.';

const MESSAGE_COLUMNS = 'id, conversation_id, turn_id, seq, role, content, text, model, stop_reason, created_at';

// ─── Conversaciones ───────────────────────────────────────────────────────────

export async function createConversation({
  orgId,
  userId,
  brandId,
}: {
  orgId: string;
  userId: string;
  brandId: string | null;
}): Promise<ConversationRow> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_conversations')
    .insert({ org_id: orgId, user_id: userId, brand_id: brandId })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`No se pudo crear la conversación: ${error?.message ?? 'sin fila'}`);
  }
  return normalizeConversation(data as ConversationRow);
}

/** `null` si no existe, está archivada o es de otro usuario. */
export async function getConversation(
  id: string,
  orgId: string,
  userId: string,
): Promise<ConversationRow | null> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_conversations')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la conversación: ${error.message}`);
  return data ? normalizeConversation(data as ConversationRow) : null;
}

function normalizeConversation(row: ConversationRow): ConversationRow {
  // bigint puede llegar como string desde PostgREST.
  return {
    ...row,
    tainted_through_seq: row.tainted_through_seq == null ? null : Number(row.tainted_through_seq),
  };
}

export async function listConversations(
  userId: string,
  orgId: string,
  { limit = 30, before }: { limit?: number; before?: string } = {},
): Promise<ConversationListItem[]> {
  const db = createSupabaseServer();
  let q = db
    .from('kefy_assistant_conversations')
    .select('id, title, last_message_at, brand_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(Math.min(Math.max(1, limit), 30));
  if (before) q = q.lt('last_message_at', before);

  const { data, error } = await q;
  if (error) throw new Error(`No se pudieron leer las conversaciones: ${error.message}`);
  return (data ?? []) as ConversationListItem[];
}

/** Archiva la conversación. `false` si no existía (o no era del usuario). */
export async function archiveConversation(id: string, orgId: string, userId: string): Promise<boolean> {
  const db = createSupabaseServer();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('kefy_assistant_conversations')
    .update({ archived_at: nowIso, updated_at: nowIso })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`No se pudo archivar la conversación: ${error.message}`);
  return !!data;
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export async function appendMessage({
  conversationId,
  orgId,
  userId,
  turnId,
  role,
  content,
  text,
  model,
  stopReason,
  usage,
}: {
  conversationId: string;
  orgId: string;
  userId: string;
  turnId?: string | null;
  role: 'user' | 'assistant';
  content: unknown[];
  text?: string | null;
  model?: string | null;
  stopReason?: string | null;
  usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null } | null;
}): Promise<{ id: string; seq: number }> {
  const db = createSupabaseServer();
  const cleanText = text && text.trim() ? text : null;

  const { data, error } = await db
    .from('kefy_assistant_messages')
    .insert({
      conversation_id: conversationId,
      org_id: orgId,
      user_id: userId,
      turn_id: turnId ?? null,
      role,
      content,
      text: cleanText,
      model: model ?? null,
      stop_reason: stopReason ?? null,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      cache_read_tokens: usage?.cache_read_input_tokens ?? null,
    })
    .select('id, seq')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo guardar el mensaje: ${error?.message ?? 'sin fila'}`);
  }

  const nowIso = new Date().toISOString();
  await db
    .from('kefy_assistant_conversations')
    .update({ last_message_at: nowIso, updated_at: nowIso })
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .eq('user_id', userId);

  // El primer mensaje del usuario da título a la conversación.
  if (role === 'user' && cleanText) {
    await db
      .from('kefy_assistant_conversations')
      .update({ title: cleanText.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) })
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .is('title', null);
  }

  const row = data as { id: string; seq: number | string };
  return { id: row.id, seq: Number(row.seq) };
}

/** Último mensaje de la conversación, o null si está vacía. */
export async function getLastMessage(
  conversationId: string,
  orgId: string,
  userId: string,
): Promise<MessageRow | null> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el último mensaje: ${error.message}`);
  return data ? normalizeMessage(data as MessageRow) : null;
}

/** Un mensaje por id (org-scoped): lo usa la reanudación tras confirmar. */
export async function getMessageById(id: string, orgId: string): Promise<MessageRow | null> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el mensaje: ${error.message}`);
  return data ? normalizeMessage(data as MessageRow) : null;
}

function normalizeMessage(row: MessageRow): MessageRow {
  return {
    ...row,
    seq: Number(row.seq),
    content: Array.isArray(row.content) ? row.content : [],
  };
}

// ─── Snapshot del espacio de trabajo ─────────────────────────────────────────

/** Neutraliza etiquetas que podrían cerrar los bloques del snapshot. */
function neutralizeTags(value: string): string {
  return value.replace(/<\/?(brand_data|workspace_snapshot)/gi, (m) => m.replace('<', '&lt;'));
}

function wrapBrandField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value);
  if (!text.trim()) return null;
  return wrapUntrusted('brand_data', neutralizeTags(text));
}

/**
 * Resumen compacto del brand kit para el snapshot. Estos campos los rellena el
 * usuario, pero también un scraper (Firecrawl) a partir de una web ajena: van
 * envueltos como no confiables. Si el kit no existe o falla la lectura, '{}'.
 */
export async function loadBrandData(brandId: string): Promise<string> {
  try {
    const db = createSupabaseServer();
    const { data, error } = await getBrandKitForBrand(db, brandId);
    if (error || !data) return '{}';
    const kit = data as Record<string, unknown>;
    return JSON.stringify({
      name: wrapBrandField(kit.name),
      tagline: wrapBrandField(kit.tagline),
      industry: wrapBrandField(kit.industry),
      tone: wrapBrandField(kit.tone),
      target_audience: wrapBrandField(kit.target_audience),
      niche: wrapBrandField(kit.niche),
      mission: wrapBrandField(kit.mission),
      language: typeof kit.language === 'string' ? kit.language.slice(0, 16) : null,
      uses_emojis: typeof kit.uses_emojis === 'boolean' ? kit.uses_emojis : null,
    });
  } catch {
    return '{}';
  }
}

/**
 * Bloque <workspace_snapshot> que va al final de cada mensaje del usuario. Se
 * guarda con el mensaje y nunca se regenera: así el prefijo cacheado no cambia
 * en los mensajes siguientes.
 */
export function buildSnapshotBlock(
  snapshot: WorkspaceSnapshot,
  {
    pagePath,
    timezone,
    nowIso,
    brandData,
  }: { pagePath?: string | null; timezone?: string | null; nowIso: string; brandData: string },
): { type: 'text'; text: string } {
  // '<' escapado en el JSON: ningún nombre de marca u organización puede abrir
  // o cerrar una etiqueta del bloque.
  const json = JSON.stringify({
    ...snapshot,
    page: pagePath ?? null,
    timezone: timezone ?? null,
    now: nowIso,
  }).replace(/</g, '\\u003c');

  return {
    type: 'text',
    text: `<workspace_snapshot>\n${json}\n<brand_data>${brandData}</brand_data>\n</workspace_snapshot>`,
  };
}

// ─── Historial para el modelo ─────────────────────────────────────────────────

const isToolUse = (b: ContentBlock): boolean => b.type === 'tool_use';
const isToolResult = (b: ContentBlock): boolean => b.type === 'tool_result';

function hasUserText(row: MessageRow): boolean {
  return row.role === 'user' && row.content.some((b) => b.type === 'text');
}

function errorResult(toolUseId: string, content: string): ContentBlock {
  const block: ToolResultBlock = { type: 'tool_result', tool_use_id: toolUseId, is_error: true, content };
  return block as unknown as ContentBlock;
}

/**
 * ¿La respuesta del modelo tiene algo que reenviar? La API rechaza (400) un
 * mensaje del asistente vacío, o con solo texto vacío, que no sea el último.
 * Puede llegar así un refusal al empezar o un end_turn vacío tras tool_result.
 */
export function hasReplayableContent(content: ReadonlyArray<{ type: string; [k: string]: unknown }>): boolean {
  return content.some((b) => b.type !== 'text' || (typeof b.text === 'string' && b.text.trim() !== ''));
}

/**
 * Un tool_result por tool_use_id. Si una respuesta tardía (la herramienta
 * terminó después de que el usuario escribió otro mensaje) dejó dos, gana el
 * último que no es error; si todos son error, el primero.
 */
function dedupeToolResults(results: ContentBlock[]): ContentBlock[] {
  const chosen = new Map<string, ContentBlock>();
  for (const b of results) {
    const id = String(b.tool_use_id);
    // Map conserva la posición del primero aunque se reemplace el valor.
    if (!chosen.has(id) || b.is_error !== true) chosen.set(id, b);
  }
  return [...chosen.values()];
}

/**
 * Deja la secuencia de mensajes válida para la API sin tocar los bloques del
 * asistente: cada tool_use tiene su tool_result en el mensaje siguiente, y no
 * hay tool_result sin su tool_use. Solo se añaden o quitan bloques de los
 * mensajes del usuario, de forma determinista (mismo historial → mismo
 * resultado, así la caché sigue funcionando).
 */
function sanitizeToolPairs(messages: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }>) {
  const out: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }> = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant') {
      // Una respuesta vacía se salta entera (sus bloques no se editan).
      if (hasReplayableContent(m.content)) out.push(m);
      continue;
    }

    const prev = out[out.length - 1];
    const expected = prev?.role === 'assistant'
      ? prev.content.filter(isToolUse).map((b) => String(b.id))
      : [];

    const results = dedupeToolResults(m.content.filter(
      (b) => isToolResult(b) && expected.includes(String(b.tool_use_id)),
    ));
    const answered = new Set(results.map((b) => String(b.tool_use_id)));
    const missing = expected.filter((id) => !answered.has(id)).map((id) => errorResult(id, INTERRUPTED));
    const rest = m.content.filter((b) => !isToolResult(b));

    // Los tool_result van primero dentro del mensaje del usuario.
    const content = [...results, ...missing, ...rest];
    if (content.length > 0) out.push({ role: 'user', content });
  }

  // Si el último mensaje del asistente pide herramientas y no hay respuesta,
  // se completa con errores (solo en memoria; loadHistory ya persistió la
  // reparación cuando correspondía).
  const last = out[out.length - 1];
  if (last?.role === 'assistant') {
    const ids = last.content.filter(isToolUse).map((b) => String(b.id));
    if (ids.length > 0) out.push({ role: 'user', content: ids.map((id) => errorResult(id, INTERRUPTED)) });
  }

  return out;
}

function mergeSameRole(messages: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }>) {
  const out: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }> = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = [...prev.content, ...m.content];
    } else {
      out.push({ role: m.role, content: [...m.content] });
    }
  }
  return out;
}

/** Filas de acciones de un mensaje que todavía pueden producir su resultado. */
async function hasOpenActions(messageId: string, orgId: string): Promise<boolean> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .select('id')
    .eq('message_id', messageId)
    .eq('org_id', orgId)
    .in('status', ['pending_confirmation', 'running'])
    .limit(1);
  if (error) throw new Error(`No se pudieron leer las acciones: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Historial para la siguiente llamada al modelo.
 *
 *   1. Los últimos `limit` mensajes, en orden.
 *   2. Se descartan los del principio hasta empezar en un mensaje del usuario
 *      con texto (no uno de solo tool_result), y se quitan los tool_result de
 *      ese primero: su tool_use quedó fuera de la ventana.
 *   3. Si el último mensaje es del asistente con tool_use sin respuesta y sin
 *      acciones pendientes o en curso, se GUARDA un mensaje del usuario con un
 *      error por cada tool_use (la ejecución se interrumpió).
 *   4. Se validan los pares tool_use / tool_result y se fusionan los mensajes
 *      consecutivos del mismo rol.
 *
 * Los bloques pasan sin cambios, incluidos thinking y los tipos desconocidos.
 * `minSeq` es el seq más antiguo de la ventana (para el taint).
 */
export async function loadHistory(
  conversationId: string,
  orgId: string,
  userId: string,
  { limit = HISTORY_LIMIT }: { limit?: number } = {},
): Promise<{ messages: Anthropic.MessageParam[]; minSeq: number }> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('seq', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);

  let rows = ((data ?? []) as MessageRow[]).map(normalizeMessage).reverse();

  const start = rows.findIndex(hasUserText);
  rows = start === -1 ? [] : rows.slice(start);
  const minSeq = rows.length > 0 ? rows[0].seq : Number.MAX_SAFE_INTEGER;

  const messages = rows.map((r, i) => ({
    role: r.role,
    content: i === 0 ? r.content.filter((b) => !isToolResult(b)) : r.content,
  }));

  // Reparación persistida de un turno interrumpido a mitad de herramientas.
  const last = rows[rows.length - 1];
  if (last?.role === 'assistant') {
    const toolUses = last.content.filter(isToolUse);
    if (toolUses.length > 0 && !(await hasOpenActions(last.id, orgId))) {
      const blocks = toolUses.map((b) => errorResult(String(b.id), INTERRUPTED));
      await appendMessage({
        conversationId, orgId, userId, turnId: last.turn_id, role: 'user', content: blocks,
      });
      messages.push({ role: 'user', content: blocks });
    }
  }

  const clean = mergeSameRole(sanitizeToolPairs(mergeSameRole(messages)));
  return { messages: clean as unknown as Anthropic.MessageParam[], minSeq };
}

/** seq más antiguo de la ventana de historial (sin reparar nada). */
export async function historyMinSeq(
  conversationId: string,
  orgId: string,
  userId: string,
  limit = HISTORY_LIMIT,
): Promise<number> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_messages')
    .select('seq')
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('seq', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  const seqs = (data ?? []).map((r) => Number((r as { seq: number | string }).seq));
  return seqs.length > 0 ? Math.min(...seqs) : Number.MAX_SAFE_INTEGER;
}

// ─── Taint ────────────────────────────────────────────────────────────────────

/**
 * Marca que el mensaje `seq` trajo contenido de terceros. Mientras siga en la
 * ventana de historial, toda escritura del chat pide confirmación.
 */
export async function markTainted(conversationId: string, orgId: string, seq: number): Promise<void> {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_assistant_conversations')
    .select('tainted_through_seq')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .maybeSingle();
  const current = (data as { tainted_through_seq: number | string | null } | null)?.tainted_through_seq;
  if (current != null && Number(current) >= seq) return;

  const { error } = await db
    .from('kefy_assistant_conversations')
    .update({ tainted_through_seq: seq })
    .eq('id', conversationId)
    .eq('org_id', orgId);
  if (error) throw new Error(`No se pudo marcar la conversación: ${error.message}`);
}

/** ¿Hay contenido no confiable dentro de la ventana que empieza en minSeq? */
export function isTainted(conv: Pick<ConversationRow, 'tainted_through_seq'>, minSeq: number): boolean {
  return conv.tainted_through_seq != null && conv.tainted_through_seq >= minSeq;
}

/** Relee el taint de la conversación (puede haber cambiado dentro del turno). */
export async function refreshTaint(conversationId: string, orgId: string): Promise<number | null> {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_assistant_conversations')
    .select('tainted_through_seq')
    .eq('id', conversationId)
    .eq('org_id', orgId)
    .maybeSingle();
  const v = (data as { tainted_through_seq: number | string | null } | null)?.tainted_through_seq;
  return v == null ? null : Number(v);
}

// ─── Acciones de una conversación ────────────────────────────────────────────

export async function listPendingActions(
  conversationId: string,
  orgId: string,
  userId: string,
): Promise<ActionRow[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_assistant_actions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`No se pudieron leer las acciones pendientes: ${error.message}`);
  return (data ?? []) as ActionRow[];
}

// ─── Vista para la UI ─────────────────────────────────────────────────────────

function parseResultContent(content: unknown): { links?: ToolLink[]; error?: string } {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '')).join('')
      : '';
  try {
    const parsed = JSON.parse(text) as { links?: ToolLink[]; error?: { message?: string } | string };
    const error = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    return { links: Array.isArray(parsed.links) ? parsed.links : undefined, error };
  } catch {
    // Resultado truncado o texto plano (interrumpido, rechazado…).
    return { error: text || undefined };
  }
}

function linksFromAction(action: ActionRow | undefined): ToolLink[] | undefined {
  const r = action?.result as { links?: ToolLink[] } | null | undefined;
  return Array.isArray(r?.links) ? r!.links : undefined;
}

function toolStatus(
  action: ActionRow | undefined,
  result: ContentBlock | undefined,
): DisplayToolStatus {
  if (action?.status === 'rejected') return 'rejected';
  if (action?.status === 'expired') return 'expired';
  if (result) return result.is_error ? 'error' : 'done';
  switch (action?.status) {
    case 'pending_confirmation':
    case 'running':
      return 'pending';
    case 'succeeded':
      return 'done';
    default:
      return 'error';
  }
}

/**
 * Conversación lista para pintar: mensajes visibles (sin thinking, sin el
 * snapshot, sin los mensajes de solo tool_result), el estado de cada
 * herramienta y las confirmaciones todavía pendientes. Los mensajes seguidos
 * del asistente dentro de un turno se juntan en una sola burbuja.
 */
export async function getConversationForDisplay(
  id: string,
  orgId: string,
  userId: string,
): Promise<{ conversation: ConversationRow; messages: DisplayMessage[]; pendingActions: PendingActionView[] } | null> {
  const conversation = await getConversation(id, orgId, userId);
  if (!conversation) return null;

  const db = createSupabaseServer();
  const [msgRes, actRes] = await Promise.all([
    db
      .from('kefy_assistant_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', id)
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .order('seq', { ascending: false })
      .limit(DISPLAY_LIMIT),
    db
      .from('kefy_assistant_actions')
      .select('*')
      .eq('conversation_id', id)
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
  ]);
  if (msgRes.error) throw new Error(`No se pudieron leer los mensajes: ${msgRes.error.message}`);
  if (actRes.error) throw new Error(`No se pudieron leer las acciones: ${actRes.error.message}`);

  const rows = ((msgRes.data ?? []) as MessageRow[]).map(normalizeMessage).reverse();
  const actions = (actRes.data ?? []) as ActionRow[];

  // La última fila por tool_use_id manda (created_at ascendente).
  const actionByToolUse = new Map<string, ActionRow>();
  for (const a of actions) if (a.tool_use_id) actionByToolUse.set(a.tool_use_id, a);

  const resultByToolUse = new Map<string, ContentBlock>();
  for (const r of rows) {
    if (r.role !== 'user') continue;
    for (const b of r.content) if (isToolResult(b)) resultByToolUse.set(String(b.tool_use_id), b);
  }

  const messages: DisplayMessage[] = [];
  for (const r of rows) {
    if (r.role === 'user') {
      // El texto visible es el que escribió el usuario (columna text), nunca el snapshot.
      if (!r.text) continue;
      messages.push({ id: r.id, role: 'user', text: r.text, createdAt: r.created_at, tools: [] });
      continue;
    }

    const text = r.text ?? r.content
      .filter((b) => b.type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');
    const tools: DisplayTool[] = r.content.filter(isToolUse).map((b) => {
      const toolUseId = String(b.id);
      const action = actionByToolUse.get(toolUseId);
      const result = resultByToolUse.get(toolUseId);
      const parsed = result ? parseResultContent(result.content) : {};
      const status = toolStatus(action, result);
      const tool: DisplayTool = { toolUseId, name: String(b.name), status };
      const links = parsed.links ?? linksFromAction(action);
      if (links?.length) tool.links = links;
      if (status === 'error' && parsed.error) tool.error = parsed.error.slice(0, 300);
      return tool;
    });

    const prev = messages[messages.length - 1];
    if (prev?.role === 'assistant') {
      if (text.trim()) prev.text = prev.text ? `${prev.text}\n\n${text}` : text;
      prev.tools.push(...tools);
    } else {
      messages.push({ id: r.id, role: 'assistant', text, createdAt: r.created_at, tools });
    }
  }

  const now = Date.now();
  const pendingActions: PendingActionView[] = actions
    .filter((a) => a.status === 'pending_confirmation' && a.user_id === userId)
    .filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now)
    .map((a) => {
      const r = (a.result ?? {}) as { summary?: string; preview?: Record<string, unknown>; credits?: number };
      return {
        actionId: a.id,
        toolUseId: a.tool_use_id,
        name: a.tool_name,
        summary: r.summary ?? a.tool_name,
        preview: r.preview ?? {},
        credits: typeof r.credits === 'number' ? r.credits : a.credits_estimated,
        expiresAt: a.expires_at ?? '',
      };
    });

  return { conversation, messages, pendingActions };
}
