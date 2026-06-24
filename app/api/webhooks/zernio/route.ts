import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';

// ─── POST /api/webhooks/zernio ─────────────────────────────────────────────────
// Receives real-time events from Zernio and processes them.
//
// Security: HMAC-SHA256 using ZERNIO_WEBHOOK_SECRET.
// Header: x-zernio-signature: sha256=<hex>
//
// Handled events:
//   Posts:    post.scheduled, post.published, post.failed, post.partial,
//             post.cancelled, post.recycled,
//             post.platform.published, post.platform.failed
//   Accounts: account.connected, account.disconnected,
//             account.ads.initial_sync_completed
//   Messages: message.received, message.sent, message.edited,
//             message.deleted, message.delivered, message.read, message.failed
//   Comments: comment.received
//   Reviews:  review.new, review.updated
//   Ads:      ad.status_changed

// ─── Payload normalizer ────────────────────────────────────────────────────────
// Zernio sends flat top-level resource objects in camelCase:
//   { id, event, post: {...}, account: {...}, timestamp }
// Normalize to the snake_case `data` map the handlers expect.

function normalizePayload(raw: Record<string, unknown>): Data {
  const d: Data = {};

  // account: { id, platform, username }
  if (raw.account && typeof raw.account === 'object') {
    const a = raw.account as Record<string, unknown>;
    d.account_id = a.id;
    d.platform   = a.platform;
    d.username   = a.username;
  }

  // post: { id, platform, accountId, url, content, publishedAt, ... }
  if (raw.post && typeof raw.post === 'object') {
    const p = raw.post as Record<string, unknown>;
    d.post_id          = p.id;
    d.platform_post_id = p.id;
    if (p.platform)   d.platform   = p.platform;
    if (p.accountId)  d.account_id = p.accountId;
    if (p.publishedAt) d.published_at = p.publishedAt;
    if (p.content)    d.content    = p.content;
    if (p.url)        d.url        = p.url;
  }

  // message: { id, threadId, body, senderId, senderName, senderAvatar, direction }
  if (raw.message && typeof raw.message === 'object') {
    const m = raw.message as Record<string, unknown>;
    d.message_id    = m.id;
    d.thread_id     = m.threadId ?? m.thread_id;
    d.body          = m.body ?? m.content;
    d.sender_id     = m.senderId    ?? m.sender_id;
    d.sender_name   = m.senderName  ?? m.sender_name;
    d.sender_avatar = m.senderAvatar ?? m.sender_avatar;
    d.direction     = m.direction;
  }

  // comment: { id, postId, platformPostId, platform, text, author: { id, username, avatar }, createdAt }
  if (raw.comment && typeof raw.comment === 'object') {
    const c = raw.comment as Record<string, unknown>;
    d.comment_id       = c.id;
    // Use platformPostId as the platform post ID; fall back to postId (Zernio internal)
    d.platform_post_id = c.platformPostId ?? c.postId ?? d.platform_post_id;
    d.post_id          = c.postId ?? d.post_id;
    d.zernio_post_id   = typeof c.postId === 'string' ? c.postId : undefined;
    // Zernio uses `text`, not `body`
    d.body             = c.text ?? c.body ?? c.content;
    if (c.platform)    d.platform = c.platform;
    // Author can be a nested object { id, username, avatar } or flat fields
    if (c.author && typeof c.author === 'object') {
      const au = c.author as Record<string, unknown>;
      d.author_id     = au.id;
      d.author_name   = au.username ?? au.name ?? au.displayName;
      d.author_avatar = au.avatar   ?? au.profilePicture ?? au.avatarUrl;
    } else {
      d.author_id     = c.authorId    ?? c.author_id;
      d.author_name   = c.authorName  ?? c.author_name;
      d.author_avatar = c.authorAvatar ?? c.author_avatar;
    }
  }

  // review: { id, reviewerId, reviewerName, reviewerAvatar, rating, body, publishedAt }
  if (raw.review && typeof raw.review === 'object') {
    const r = raw.review as Record<string, unknown>;
    d.review_id      = r.id;
    d.reviewer_id    = r.reviewerId   ?? r.reviewer_id;
    d.reviewer_name  = r.reviewerName ?? r.reviewer_name;
    d.reviewer_avatar = r.reviewerAvatar ?? r.reviewer_avatar;
    d.rating         = r.rating;
    d.body           = r.body;
    d.published_at   = r.publishedAt  ?? r.published_at ?? d.published_at;
  }

  // boost / ad: { id, status, startedAt, endedAt }
  if (raw.boost && typeof raw.boost === 'object') {
    const b = raw.boost as Record<string, unknown>;
    d.boost_id   = b.id;
    d.status     = b.status;
    d.started_at = b.startedAt ?? b.started_at;
    d.ended_at   = b.endedAt   ?? b.ended_at;
  }

  return d;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

type DB = ReturnType<typeof createSupabaseServer>;
type Data = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// Resolve internal social account by zernio_account_id
async function resolveAccount(db: DB, zernioAccountId: string) {
  const { data } = await db
    .from('kefy_social_accounts')
    .select('id, org_id, brand_id')
    .eq('zernio_account_id', zernioAccountId)
    .maybeSingle();
  return data;
}

// ─── Post handlers ─────────────────────────────────────────────────────────────

async function handlePostScheduled(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  const scheduledAt  = strOrNull(data.scheduled_at);
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'scheduled', scheduled_at: scheduledAt, error_message: null })
    .eq('zernio_post_id', zernioPostId);
}

async function handlePostPublished(db: DB, data: Data) {
  const zernioPostId   = str(data.post_id);
  const platformPostId = strOrNull(data.platform_post_id);
  const publishedAt    = strOrNull(data.published_at) ?? new Date().toISOString();
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'published', published_at: publishedAt, platform_post_id: platformPostId, error_message: null })
    .eq('zernio_post_id', zernioPostId);
}

async function handlePostFailed(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  const errorMessage = strOrNull(data.error) ?? 'Publish failed';
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('zernio_post_id', zernioPostId);
}

// post.partial: some platforms failed — map to 'failed' with an informative message
async function handlePostPartial(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  if (!zernioPostId) return;
  const failedPlatforms = Array.isArray(data.failed_platforms)
    ? (data.failed_platforms as unknown[]).join(', ')
    : '';
  const msg = failedPlatforms
    ? `Partial publish — failed on: ${failedPlatforms}`
    : 'Partial publish — some platforms failed';
  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'failed', error_message: msg })
    .eq('zernio_post_id', zernioPostId);
}

async function handlePostCancelled(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('zernio_post_id', zernioPostId);
}

// post.recycled: post was re-queued (e.g. for evergreen recycling)
async function handlePostRecycled(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  const scheduledAt  = strOrNull(data.scheduled_at);
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'scheduled', scheduled_at: scheduledAt, error_message: null, published_at: null })
    .eq('zernio_post_id', zernioPostId);
}

// post.platform.published: one specific platform within a multi-platform post published
async function handlePostPlatformPublished(db: DB, data: Data) {
  const zernioPostId   = str(data.post_id);
  const platformPostId = strOrNull(data.platform_post_id);
  const publishedAt    = strOrNull(data.published_at) ?? new Date().toISOString();
  if (!zernioPostId) return;

  // Mark the row for this specific platform as published
  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'published', published_at: publishedAt, platform_post_id: platformPostId, error_message: null })
    .eq('zernio_post_id', zernioPostId);
}

// post.platform.failed: one specific platform failed
async function handlePostPlatformFailed(db: DB, data: Data) {
  const zernioPostId = str(data.post_id);
  const errorMessage = strOrNull(data.error) ?? 'Platform publish failed';
  if (!zernioPostId) return;

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('zernio_post_id', zernioPostId);
}

// ─── Account handlers ──────────────────────────────────────────────────────────

// account.connected: update an existing account's status/tokens if it already exists.
// New accounts are provisioned through the OAuth callback, not here.
async function handleAccountConnected(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  if (!zernioAccountId) return;

  const updates: Record<string, unknown> = { status: 'active' };
  if (str(data.username))         updates.username         = data.username;
  if (str(data.avatar_url))       updates.avatar_url       = data.avatar_url;
  if (str(data.access_token))     updates.access_token     = data.access_token;
  if (str(data.refresh_token))    updates.refresh_token    = data.refresh_token;
  if (str(data.token_expires_at)) updates.token_expires_at = data.token_expires_at;

  await db
    .from('kefy_social_accounts')
    .update(updates)
    .eq('zernio_account_id', zernioAccountId);
}

async function handleAccountDisconnected(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  if (!zernioAccountId) return;

  await db
    .from('kefy_social_accounts')
    .update({ status: 'revoked' })
    .eq('zernio_account_id', zernioAccountId);
}

// account.ads.initial_sync_completed: no dedicated column — accepted and ignored.
// Extend this if you add an ads_synced_at column to kefy_social_accounts.
function handleAccountAdsInitialSyncCompleted(_db: DB, _data: Data): void {
  // no-op — acknowledged
}

// ─── Message handlers ──────────────────────────────────────────────────────────

async function handleMessageReceived(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  const platform        = str(data.platform);
  const threadId        = str(data.thread_id);
  const messageId       = str(data.message_id);
  const body            = str(data.body);
  const senderId        = str(data.sender_id);

  if (!zernioAccountId || !threadId || !messageId || !body || !senderId || !platform) return;

  const account = await resolveAccount(db, zernioAccountId);
  if (!account) return;

  await db.from('kefy_messages').upsert(
    {
      org_id:              account.org_id,
      brand_id:            account.brand_id ?? null,
      social_account_id:   account.id,
      platform,
      platform_thread_id:  threadId,
      platform_message_id: messageId,
      zernio_message_id:   strOrNull(data.zernio_message_id),
      sender_id:           senderId,
      sender_name:         strOrNull(data.sender_name),
      sender_avatar:       strOrNull(data.sender_avatar),
      body,
      direction:           'inbound',
    },
    { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: true },
  );
}

// message.sent: an outbound message was sent (possibly from another tool or the platform itself)
async function handleMessageSent(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  const platform        = str(data.platform);
  const threadId        = str(data.thread_id);
  const messageId       = str(data.message_id);
  const body            = str(data.body);
  const senderId        = str(data.sender_id) ?? str(data.recipient_id) ?? 'self';

  if (!zernioAccountId || !threadId || !messageId || !body || !platform) return;

  const account = await resolveAccount(db, zernioAccountId);
  if (!account) return;

  await db.from('kefy_messages').upsert(
    {
      org_id:              account.org_id,
      brand_id:            account.brand_id ?? null,
      social_account_id:   account.id,
      platform,
      platform_thread_id:  threadId,
      platform_message_id: messageId,
      zernio_message_id:   strOrNull(data.zernio_message_id),
      sender_id:           senderId,
      sender_name:         strOrNull(data.sender_name),
      sender_avatar:       null,
      body,
      direction:           'outbound',
    },
    { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: true },
  );
}

async function handleMessageEdited(db: DB, data: Data) {
  const messageId = str(data.message_id);
  const body      = str(data.body);
  if (!messageId || !body) return;

  // Try by platform_message_id first, fall back to zernio_message_id
  const { error } = await db
    .from('kefy_messages')
    .update({ body })
    .eq('platform_message_id', messageId);

  if (error) {
    const zernioMsgId = str(data.zernio_message_id);
    if (zernioMsgId) {
      await db.from('kefy_messages').update({ body }).eq('zernio_message_id', zernioMsgId);
    }
  }
}

async function handleMessageDeleted(db: DB, data: Data) {
  const messageId   = str(data.message_id);
  if (!messageId) return;

  // Soft-delete: overwrite body with a placeholder
  await db
    .from('kefy_messages')
    .update({ body: '[mensaje eliminado]' })
    .eq('platform_message_id', messageId);
}

// message.delivered — no delivered_at column; accepted and ignored.
function handleMessageDelivered(_db: DB, _data: Data): void {
  // no-op — no column to update
}

async function handleMessageRead(db: DB, data: Data) {
  const messageId = str(data.message_id);
  const readAt    = strOrNull(data.read_at) ?? new Date().toISOString();
  if (!messageId) return;

  await db
    .from('kefy_messages')
    .update({ read_at: readAt })
    .eq('platform_message_id', messageId)
    .is('read_at', null); // only update if not already marked read
}

// message.failed — no status column on kefy_messages; accepted and ignored.
function handleMessageFailed(_db: DB, _data: Data): void {
  // no-op — no failed-status column
}

// ─── Comment handler ───────────────────────────────────────────────────────────

async function handleCommentReceived(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  const platform        = str(data.platform);
  // platform_post_id holds the actual platform ID; post_id holds Zernio's internal ID
  const platformPostId  = str(data.platform_post_id) ?? str(data.post_id);
  const commentId       = str(data.comment_id);
  const body            = str(data.body);
  const authorId        = str(data.author_id);
  const zernioPostId    = str(data.zernio_post_id) ?? str(data.post_id);

  if (!zernioAccountId || !platformPostId || !commentId || !body || !authorId || !platform) return;

  const account = await resolveAccount(db, zernioAccountId);
  if (!account) return;

  let scheduledPostId: string | null = null;
  if (zernioPostId) {
    const { data: sp } = await db
      .from('kefy_scheduled_posts')
      .select('id')
      .eq('zernio_post_id', zernioPostId)
      .maybeSingle();
    scheduledPostId = sp?.id ?? null;
  }

  await db.from('kefy_comments').upsert(
    {
      org_id:              account.org_id,
      brand_id:            account.brand_id ?? null,
      social_account_id:   account.id,
      scheduled_post_id:   scheduledPostId,
      platform,
      platform_post_id:    platformPostId,
      platform_comment_id: commentId,
      zernio_comment_id:   strOrNull(data.zernio_comment_id),
      author_id:           authorId,
      author_name:         strOrNull(data.author_name),
      author_avatar:       strOrNull(data.author_avatar),
      body,
    },
    { onConflict: 'social_account_id,platform_comment_id', ignoreDuplicates: true },
  );
}

// ─── Review handlers ───────────────────────────────────────────────────────────

async function upsertReview(db: DB, data: Data) {
  const zernioAccountId = str(data.account_id);
  const platform        = str(data.platform);
  const reviewId        = str(data.review_id);
  const reviewerId      = str(data.reviewer_id) ?? 'unknown';
  const rating          = typeof data.rating === 'number' ? data.rating : null;
  const publishedAt     = strOrNull(data.published_at);

  if (!zernioAccountId || !platform || !reviewId) return;

  const account = await resolveAccount(db, zernioAccountId);
  if (!account) return;

  await db.from('kefy_reviews').upsert(
    {
      org_id:            account.org_id,
      social_account_id: account.id,
      platform,
      platform_review_id: reviewId,
      zernio_review_id:   strOrNull(data.zernio_review_id),
      reviewer_id:        reviewerId,
      reviewer_name:      strOrNull(data.reviewer_name),
      reviewer_avatar:    strOrNull(data.reviewer_avatar),
      rating,
      body:               strOrNull(data.body),
      published_at:       publishedAt,
    },
    { onConflict: 'social_account_id,platform_review_id' },
  );
}

// ─── Ads handler ───────────────────────────────────────────────────────────────

const VALID_BOOST_STATUSES = new Set(['pending', 'active', 'completed', 'cancelled', 'failed']);

async function handleAdStatusChanged(db: DB, data: Data) {
  const zernioBoostId = str(data.boost_id);
  const newStatus     = str(data.status);
  if (!zernioBoostId || !newStatus) return;
  if (!VALID_BOOST_STATUSES.has(newStatus)) return;

  const updates: Record<string, unknown> = { status: newStatus };
  if (str(data.started_at)) updates.started_at = data.started_at;
  if (str(data.ended_at))   updates.ended_at   = data.ended_at;

  await db
    .from('kefy_ad_boosts')
    .update(updates)
    .eq('zernio_boost_id', zernioBoostId);
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = str(rawPayload.event);
  if (!event) {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 });
  }

  // Normalize the flat camelCase Zernio payload to internal snake_case Data
  const data = normalizePayload(rawPayload);

  const db = createSupabaseServer();

  switch (event) {
    // ── Posts ────────────────────────────────────────────────────────────
    case 'post.scheduled':
      await handlePostScheduled(db, data); break;
    case 'post.published':
      await handlePostPublished(db, data); break;
    case 'post.failed':
      await handlePostFailed(db, data); break;
    case 'post.partial':
      await handlePostPartial(db, data); break;
    case 'post.cancelled':
      await handlePostCancelled(db, data); break;
    case 'post.recycled':
      await handlePostRecycled(db, data); break;
    case 'post.platform.published':
      await handlePostPlatformPublished(db, data); break;
    case 'post.platform.failed':
      await handlePostPlatformFailed(db, data); break;
    case 'post.external.created':
      // Post published outside of Kefy — no local record to update, accept and ignore.
      break;

    // ── Accounts ─────────────────────────────────────────────────────────
    case 'account.connected':
      await handleAccountConnected(db, data); break;
    case 'account.disconnected':
      await handleAccountDisconnected(db, data); break;
    case 'account.ads.initial_sync_completed':
      handleAccountAdsInitialSyncCompleted(db, data); break;

    // ── Messages ─────────────────────────────────────────────────────────
    case 'message.received':
      await handleMessageReceived(db, data); break;
    case 'message.sent':
      await handleMessageSent(db, data); break;
    case 'message.edited':
      await handleMessageEdited(db, data); break;
    case 'message.deleted':
      await handleMessageDeleted(db, data); break;
    case 'message.delivered':
      handleMessageDelivered(db, data); break;
    case 'message.read':
      await handleMessageRead(db, data); break;
    case 'message.failed':
      handleMessageFailed(db, data); break;

    // ── Comments ─────────────────────────────────────────────────────────
    case 'comment.received':
      await handleCommentReceived(db, data); break;

    // ── Reviews ──────────────────────────────────────────────────────────
    case 'review.new':
    case 'review.updated':
      await upsertReview(db, data); break;

    // ── Ads ───────────────────────────────────────────────────────────────
    case 'ad.status_changed':
      await handleAdStatusChanged(db, data); break;

    default:
      // Unknown event — accept and ignore (forward-compatible)
      break;
  }

  return NextResponse.json({ ok: true });
}
