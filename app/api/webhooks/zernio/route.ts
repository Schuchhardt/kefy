import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { createHmac, timingSafeEqual } from 'crypto';

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

// ─── Signature verification ────────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZERNIO_WEBHOOK_SECRET is not configured');
    return false;
  }
  if (!signatureHeader) return false;

  const [algo, receivedHex] = signatureHeader.split('=', 2);
  if (algo !== 'sha256' || !receivedHex) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(receivedHex, 'hex'),
    );
  } catch {
    return false;
  }
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
  const platformPostId  = str(data.post_id);
  const commentId       = str(data.comment_id);
  const body            = str(data.body);
  const authorId        = str(data.author_id);
  const zernioPostId    = str(data.zernio_post_id);

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

  const signature = req.headers.get('x-zernio-signature');
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event, data } = payload;
  if (!event || typeof data !== 'object' || data === null) {
    return NextResponse.json({ error: 'Missing event or data' }, { status: 400 });
  }

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
