// ─── Servicio: bandeja de entrada (DMs y comentarios) ────────────────────────
//
// Lógica de /api/messaging/** y /api/comments/**, compartida con las
// herramientas de bandeja del asistente (list_conversations,
// get_conversation_messages, list_comments, reply_to_conversation,
// reply_to_comment y sync_social_data).
//
// Antes de tocar las llamadas a Zernio, leer docs/zernio.md (sección Inbox).
//
// Alcance: los listados de la UI ya filtraban por marca (brand_id) y se
// mantiene. Las sincronizaciones y las respuestas eran de toda la organización
// y así siguen con brandScope 'org'; con 'strict' (herramientas) se limitan a
// las cuentas de la marca del contexto.

import { createSupabaseServer } from '@/lib/supabase';
import {
  getConversationMessages,
  getInboxConversations,
  listComments as zernioListComments,
  replyToComment as zernioReplyToComment,
  sendConversationMessage,
} from '@/lib/zernio';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { loadOwnedAccount, loadOwnedComment } from '@/lib/services/ownership';

const ROUTE = 'lib/services/inbox';

export const INBOX_PLATFORMS = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads'] as const;
const VALID_PLATFORMS = new Set<string>(INBOX_PLATFORMS);

/** Las filas de sync:{convId} son marcadores de conversación, no mensajes reales. */
const SYNC_PLACEHOLDER = 'sync:%';

function dbError(ctx: ServiceContext, op: string, message: string): void {
  reportError(new Error(message), { route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { op } });
}

// ─── Resumen ──────────────────────────────────────────────────────────────────

/**
 * DMs sin leer y comentarios sin responder de la marca del contexto. Solo
 * cuenta (head: true): no trae filas.
 */
export async function getInboxSummary(
  ctx: ServiceContext,
): Promise<{ unread_dms: number; unreplied_comments: number }> {
  const db = createSupabaseServer();

  const [dms, comments] = await Promise.all([
    db
      .from('kefy_messages')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.auth.orgId)
      .eq('brand_id', ctx.brandId)
      .eq('direction', 'inbound')
      .is('read_at', null)
      .not('platform_message_id', 'like', SYNC_PLACEHOLDER),
    db
      .from('kefy_comments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ctx.auth.orgId)
      .eq('brand_id', ctx.brandId)
      .is('replied_at', null),
  ]);

  if (dms.error) dbError(ctx, 'summary-dms', dms.error.message);
  if (comments.error) dbError(ctx, 'summary-comments', comments.error.message);

  return {
    unread_dms: dms.count ?? 0,
    unreplied_comments: comments.count ?? 0,
  };
}

// ─── DMs ──────────────────────────────────────────────────────────────────────

export interface ThreadRow {
  id: string;
  platform: string;
  platform_thread_id: string;
  platform_message_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  body: string;
  direction: 'inbound' | 'outbound';
  read_at: string | null;
  created_at: string;
  kefy_social_accounts: { id: string; platform: string; username: string | null; avatar_url: string | null };
}

/**
 * Último mensaje de cada hilo de la marca (bandeja unificada). Supabase JS no
 * tiene DISTINCT ON: se sobre-pide y se agrupa en JS.
 */
export async function listThreads(
  ctx: ServiceContext,
  input: { platform?: string | null; unreadOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ threads: ThreadRow[] }> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const db = createSupabaseServer();

  let query = db
    .from('kefy_messages')
    .select(`
      id, platform, platform_thread_id, platform_message_id,
      sender_id, sender_name, sender_avatar,
      body, direction, read_at, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url )
    `)
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit * 3 - 1); // se sobre-pide para agrupar por hilo

  if (input.platform && VALID_PLATFORMS.has(input.platform)) {
    query = query.eq('platform', input.platform);
  }
  if (input.unreadOnly) {
    query = query.is('read_at', null).eq('direction', 'inbound');
  }

  const { data: messages, error } = await query;

  if (error) {
    dbError(ctx, 'threads', error.message);
    throw new ServiceError('unavailable', 500, 'Failed to fetch messages').markReported();
  }

  // El último mensaje de cada hilo (cuenta + hilo).
  const byThread = new Map<string, ThreadRow>();
  for (const m of (messages ?? []) as unknown as ThreadRow[]) {
    const key = `${m.kefy_social_accounts.id}::${m.platform_thread_id}`;
    if (!byThread.has(key)) byThread.set(key, m);
  }

  return { threads: Array.from(byThread.values()).slice(0, limit) };
}

type InboxAccount = {
  id: string;
  zernio_account_id: string | null;
  platform: string;
  username: string | null;
  brand_id: string | null;
};

const ACCOUNT_SELECT = 'id, zernio_account_id, platform, username, brand_id';

export interface ThreadMessage {
  id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  body: string;
  direction: 'inbound' | 'outbound';
  read_at: string | null;
  created_at: string;
}

/**
 * Mensajes de un hilo desde la caché de Kefy, en orden cronológico. Lectura
 * pura: no llama a Zernio ni marca nada como leído. Con `limit` devuelve los
 * últimos N.
 */
export async function getThreadMessages(
  ctx: ServiceContext,
  input: { threadId: string; accountId: string; limit?: number },
): Promise<{ messages: ThreadMessage[]; account: Omit<InboxAccount, 'brand_id'> }> {
  const account = await loadOwnedAccount<InboxAccount>(ctx, input.accountId, { select: ACCOUNT_SELECT });
  const db = createSupabaseServer();

  let query = db
    .from('kefy_messages')
    .select('id, sender_id, sender_name, sender_avatar, body, direction, read_at, created_at')
    .eq('org_id', ctx.auth.orgId)
    .eq('social_account_id', account.id)
    .eq('platform_thread_id', input.threadId)
    .not('platform_message_id', 'ilike', SYNC_PLACEHOLDER)
    .order('created_at', { ascending: input.limit === undefined });
  if (input.limit !== undefined) query = query.limit(input.limit);

  const { data, error } = await query;

  if (error) {
    dbError(ctx, 'thread', error.message);
    throw new ServiceError('unavailable', 500, 'Failed to fetch thread').markReported();
  }

  const messages = (data ?? []) as ThreadMessage[];
  if (input.limit !== undefined) messages.reverse();

  return {
    messages,
    account: {
      id: account.id,
      zernio_account_id: account.zernio_account_id,
      platform: account.platform,
      username: account.username,
    },
  };
}

/**
 * Trae de Zernio el historial del hilo y lo guarda en kefy_messages (con el
 * brand_id de la cuenta). No es fatal: si Zernio falla se sigue con lo que ya
 * hay en la base de datos. Devuelve la cuenta (404 si no es del llamador).
 */
export async function refreshThread(
  ctx: ServiceContext,
  input: { threadId: string; accountId: string },
): Promise<{ account: InboxAccount }> {
  const account = await loadOwnedAccount<InboxAccount>(ctx, input.accountId, { select: ACCOUNT_SELECT });
  if (!account.zernio_account_id) return { account };

  try {
    const zernioRes = await getConversationMessages(input.threadId, account.zernio_account_id, {
      sortOrder: 'asc',
      limit: 100,
    });

    if (zernioRes.messages && zernioRes.messages.length > 0) {
      const now = new Date().toISOString();
      const rows = zernioRes.messages.map((m) => ({
        org_id:              ctx.auth.orgId,
        brand_id:            account.brand_id,
        social_account_id:   account.id,
        platform:            account.platform,
        platform_thread_id:  input.threadId,
        platform_message_id: m.id,
        zernio_message_id:   m.id,
        sender_id:           m.senderId,
        sender_name:         m.senderName ?? null,
        sender_avatar:       null as null,
        body:                m.message,
        direction:           m.direction === 'incoming' ? 'inbound' : 'outbound',
        read_at:             m.direction === 'outgoing' ? now : null as null,
        created_at:          m.createdAt,
      }));

      const db = createSupabaseServer();
      const { error } = await db
        .from('kefy_messages')
        .upsert(rows, { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: false });
      if (error) dbError(ctx, 'thread-upsert', error.message);
    }
  } catch (err) {
    // No es fatal: se muestra lo que ya está en la base de datos.
    console.error('getConversationMessages error:', err instanceof Error ? err.message : err);
  }

  return { account };
}

/**
 * Cuenta y destinatario de un hilo, para la tarjeta de confirmación de una
 * respuesta. El destinatario es el último remitente entrante del hilo (texto
 * de un tercero: quien lo muestre al modelo debe tratarlo como no confiable).
 */
export async function getThreadParticipant(
  ctx: ServiceContext,
  input: { threadId: string; accountId: string },
): Promise<{ account: { id: string; platform: string; username: string | null }; participant_name: string | null }> {
  const account = await loadOwnedAccount<InboxAccount>(ctx, input.accountId, {
    activeOnly: true,
    select: ACCOUNT_SELECT,
  });
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_messages')
    .select('sender_name')
    .eq('org_id', ctx.auth.orgId)
    .eq('social_account_id', account.id)
    .eq('platform_thread_id', input.threadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    account: { id: account.id, platform: account.platform, username: account.username },
    participant_name: (data?.sender_name as string | null | undefined) ?? null,
  };
}

/**
 * Marca como leídos los mensajes entrantes sin leer de una lista (los que
 * acaba de ver el usuario al abrir un hilo).
 */
export async function markThreadRead(ctx: ServiceContext, messages: ThreadMessage[]): Promise<void> {
  const unreadIds = messages
    .filter((m) => m.direction === 'inbound' && !m.read_at)
    .map((m) => m.id);
  if (unreadIds.length === 0) return;

  const db = createSupabaseServer();
  const { error } = await db
    .from('kefy_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('org_id', ctx.auth.orgId)
    .in('id', unreadIds);
  if (error) dbError(ctx, 'mark-read', error.message);
}

/**
 * Responde en un hilo de DMs vía Zernio y guarda la respuesta en local. Si el
 * guardado falla no se devuelve error: el mensaje ya salió.
 */
export async function replyToThread(
  ctx: ServiceContext,
  input: { threadId: string; accountId: string; text: string },
): Promise<{ message: unknown }> {
  const text = input.text.trim();
  const account = await loadOwnedAccount<InboxAccount>(ctx, input.accountId, {
    activeOnly: true,
    select: ACCOUNT_SELECT,
  });
  if (!account.zernio_account_id) {
    throw new ServiceError('invalid_input', 422, 'Account not connected to Zernio');
  }

  let sent;
  try {
    sent = await sendConversationMessage(input.threadId, account.zernio_account_id, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    throw new ServiceError('provider_error', 502, message);
  }

  const db = createSupabaseServer();
  const { data: stored, error: storeError } = await db
    .from('kefy_messages')
    .insert({
      org_id:               ctx.auth.orgId,
      brand_id:             account.brand_id,
      social_account_id:    account.id,
      platform:             account.platform,
      platform_thread_id:   input.threadId,
      platform_message_id:  sent.messageId,
      zernio_message_id:    sent.messageId,
      sender_id:            'self',
      sender_name:          account.username ?? null,
      sender_avatar:        null,
      body:                 text,
      direction:            'outbound',
      read_at:              new Date().toISOString(),
    })
    .select()
    .single();

  if (storeError) {
    // No falla: el mensaje ya se envió por Zernio.
    reportError(new Error(storeError.message), {
      route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { op: 'store-outbound', accountId: account.id },
    });
  }

  return { message: stored ?? sent };
}

/**
 * Trae las últimas 100 conversaciones de la bandeja unificada de Zernio y las
 * guarda como filas marcador (`sync:{convId}`), para que la bandeja tenga
 * contenido aunque no lleguen webhooks. Solo se guardan las de cuentas del
 * llamador.
 */
export async function syncInbox(
  ctx: ServiceContext,
): Promise<{ synced: number; failed: number; message?: string }> {
  const db = createSupabaseServer();

  // Perfil de Zernio de la organización (acota la petición).
  const { data: org } = await db
    .from('kefy_organizations')
    .select('zernio_profile_id')
    .eq('id', ctx.auth.orgId)
    .maybeSingle();

  let accountsQuery = db
    .from('kefy_social_accounts')
    .select('id, platform, zernio_account_id, brand_id')
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'active')
    .not('zernio_account_id', 'is', null);
  if (ctx.brandScope === 'strict') accountsQuery = accountsQuery.eq('brand_id', ctx.brandId);

  const { data: accounts } = await accountsQuery;

  if (!accounts || accounts.length === 0) {
    return { synced: 0, failed: 0, message: 'No active accounts with Zernio connection' };
  }

  // zernio_account_id → cuenta de Kefy.
  const accountMap = new Map<string, { id: string; platform: string; brand_id: string | null }>();
  for (const a of accounts) {
    if (a.zernio_account_id) {
      accountMap.set(a.zernio_account_id, { id: a.id, platform: a.platform, brand_id: a.brand_id ?? null });
    }
  }

  let inboxResponse;
  try {
    inboxResponse = await getInboxConversations({
      ...(org?.zernio_profile_id ? { profileId: org.zernio_profile_id } : {}),
      sortOrder: 'desc',
      limit: 100,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch inbox conversations';
    throw new ServiceError('provider_error', 502, message);
  }

  const conversations = inboxResponse.data ?? [];
  const failed = inboxResponse.meta?.accountsFailed ?? 0;
  if (conversations.length === 0) return { synced: 0, failed };

  const rows = [];
  for (const conv of conversations) {
    const account = accountMap.get(conv.accountId);
    if (!account) continue; // de otra organización (o de otra marca con 'strict')

    rows.push({
      org_id:              ctx.auth.orgId,
      brand_id:            account.brand_id,
      social_account_id:   account.id,
      platform:            account.platform,
      platform_thread_id:  conv.id,
      // Id marcador estable por conversación: el upsert es idempotente.
      platform_message_id: `sync:${conv.id}`,
      sender_id:           conv.participantId,
      sender_name:         conv.participantName ?? null,
      sender_avatar:       conv.participantPicture ?? null,
      body:                conv.lastMessage,
      direction:           'inbound' as const,
      created_at:          conv.updatedTime,
    });
  }

  if (rows.length === 0) return { synced: 0, failed };

  const { error: upsertError } = await db
    .from('kefy_messages')
    .upsert(rows, { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: false });

  if (upsertError) {
    dbError(ctx, 'inbox-upsert', upsertError.message);
    throw new ServiceError('unavailable', 500, 'Failed to save conversations').markReported();
  }

  return { synced: rows.length, failed };
}

// ─── Comentarios ─────────────────────────────────────────────────────────────

/**
 * Comentarios recibidos en las publicaciones de la marca. `unrepliedOnly`
 * deja solo los que no tienen respuesta (replied_at nulo).
 */
export async function listComments(
  ctx: ServiceContext,
  input: { platform?: string | null; unrepliedOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ comments: Record<string, unknown>[] }> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const db = createSupabaseServer();

  let query = db
    .from('kefy_comments')
    .select(`
      id, platform, platform_post_id, platform_comment_id,
      author_id, author_name, author_avatar,
      body, replied_at, reply_body, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url ),
      kefy_scheduled_posts ( id, platform_post_id )
    `)
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (input.platform && VALID_PLATFORMS.has(input.platform)) {
    query = query.eq('platform', input.platform);
  }
  if (input.unrepliedOnly) {
    query = query.is('replied_at', null);
  }

  const { data: comments, error } = await query;

  if (error) {
    dbError(ctx, 'comments', error.message);
    throw new ServiceError('unavailable', 500, 'Failed to fetch comments').markReported();
  }

  return { comments: (comments ?? []) as unknown as Record<string, unknown>[] };
}

/**
 * Trae de Zernio los comentarios recientes de cada cuenta activa de la marca y
 * los guarda en kefy_comments (sin pisar los que ya estaban).
 */
export async function syncComments(
  ctx: ServiceContext,
): Promise<{ synced: number; message?: string }> {
  const db = createSupabaseServer();

  const { data: accounts } = await db
    .from('kefy_social_accounts')
    .select('id, platform, zernio_account_id')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .eq('status', 'active')
    .not('zernio_account_id', 'is', null);

  if (!accounts || accounts.length === 0) {
    return { synced: 0, message: 'No active accounts with Zernio connection' };
  }

  type CommentRow = {
    org_id:              string;
    brand_id:            string;
    social_account_id:   string;
    platform:            string;
    platform_post_id:    string;
    platform_comment_id: string;
    author_id:           string;
    author_name:         string | null;
    author_avatar:       string | null;
    body:                string;
    created_at:          string;
  };

  const rows: CommentRow[] = [];

  await Promise.allSettled(
    accounts.map(async (account) => {
      if (!account.zernio_account_id) return;
      try {
        const comments = await zernioListComments(account.zernio_account_id);
        for (const c of comments) {
          if (!c.body?.trim()) continue;
          rows.push({
            org_id:              ctx.auth.orgId,
            brand_id:            ctx.brandId,
            social_account_id:   account.id,
            platform:            account.platform,
            platform_post_id:    c.post_id,
            platform_comment_id: c.comment_id,
            author_id:           c.author_id,
            author_name:         c.author_name ?? null,
            author_avatar:       c.author_avatar ?? null,
            body:                c.body,
            created_at:          c.created_at,
          });
        }
      } catch (err) {
        console.error(`comments sync error for account ${account.id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  if (rows.length === 0) return { synced: 0 };

  const { error: upsertError } = await db
    .from('kefy_comments')
    .upsert(rows, { onConflict: 'social_account_id,platform_comment_id', ignoreDuplicates: true });

  if (upsertError) {
    dbError(ctx, 'comments-upsert', upsertError.message);
    throw new ServiceError('unavailable', 500, 'Failed to save comments').markReported();
  }

  return { synced: rows.length };
}

/**
 * Datos de un comentario para la tarjeta de confirmación de una respuesta.
 * 409 si ya tiene respuesta: no tiene sentido pedir confirmación.
 */
export async function getCommentForReply(
  ctx: ServiceContext,
  commentId: string,
): Promise<{ id: string; platform: string; author_name: string | null; body: string; account_username: string | null }> {
  const comment = await loadOwnedComment<{
    id: string;
    platform: string;
    author_name: string | null;
    body: string;
    replied_at: string | null;
    kefy_social_accounts: { username: string | null } | { username: string | null }[] | null;
  }>(ctx, commentId, 'id, platform, author_name, body, replied_at, kefy_social_accounts!inner ( username )');

  if (comment.replied_at) throw new ServiceError('conflict', 409, 'Comment already replied');

  const account = Array.isArray(comment.kefy_social_accounts)
    ? comment.kefy_social_accounts[0] ?? null
    : comment.kefy_social_accounts;

  return {
    id: comment.id,
    platform: comment.platform,
    author_name: comment.author_name,
    body: comment.body,
    account_username: account?.username ?? null,
  };
}

/**
 * Responde públicamente a un comentario vía Zernio y lo marca como
 * respondido. 409 si ya tenía respuesta.
 */
export async function replyToComment(
  ctx: ServiceContext,
  input: { commentId: string; text: string },
): Promise<{ ok: true }> {
  const text = input.text.trim();
  const comment = await loadOwnedComment<{
    id: string;
    platform_comment_id: string;
    zernio_comment_id: string | null;
    platform_post_id: string;
    replied_at: string | null;
    kefy_social_accounts: { id: string; zernio_account_id: string | null } | { id: string; zernio_account_id: string | null }[];
  }>(ctx, input.commentId, `
    id, platform_comment_id, zernio_comment_id, platform_post_id, replied_at,
    kefy_social_accounts!inner ( id, zernio_account_id )
  `);

  if (comment.replied_at) throw new ServiceError('conflict', 409, 'Comment already replied');

  const account = Array.isArray(comment.kefy_social_accounts)
    ? comment.kefy_social_accounts[0]
    : comment.kefy_social_accounts;

  if (!account?.zernio_account_id) {
    throw new ServiceError('invalid_input', 422, 'Account not connected to Zernio');
  }

  const platformCommentId = comment.zernio_comment_id ?? comment.platform_comment_id;

  try {
    await zernioReplyToComment(account.zernio_account_id, comment.platform_post_id, platformCommentId, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reply';
    throw new ServiceError('provider_error', 502, message);
  }

  const db = createSupabaseServer();
  const { error: updateError } = await db
    .from('kefy_comments')
    .update({
      replied_at: new Date().toISOString(),
      reply_body: text,
    })
    .eq('id', comment.id)
    .eq('org_id', ctx.auth.orgId);

  if (updateError) {
    dbError(ctx, 'comment-update', updateError.message);
    throw new ServiceError('unavailable', 500, 'Failed to update comment').markReported();
  }

  return { ok: true };
}
