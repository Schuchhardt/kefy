// lib/zernio.ts
// Zernio social publishing API client.
//
// Required env vars:
//   ZERNIO_API_KEY  — your Zernio API key
//   ZERNIO_API_URL  — base URL (default: https://zernio.com/api/v1)
//
// Zernio acts as an abstraction layer over LinkedIn, Meta, X, TikTok, etc.
// This client wraps its REST API with typed methods.

import type {
  ZernioPlatform,
  ZernioAccount,
  ZernioPublishPayload,
  ZernioPublishResult,
  ZernioConnectResult,
  ZernioProfile,
  ZernioAccountMetrics,
  ZernioPostAnalytics,
  ZernioInstagramInsights,
  ZernioMessage,
  ZernioThread,
  ListMessagesParams,
  ZernioInboxResponse,
  ZernioInboxMessagesResponse,
  ZernioSendMessageResponse,
  ZernioComment,
  ZernioBoostPayload,
  ZernioBoostResult,
} from '@/types/social';

// ─── Client ───────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (process.env.ZERNIO_API_URL ?? 'https://zernio.com/api/v1').replace(/\/$/, '');
}

function getApiKey(): string {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error('Missing ZERNIO_API_KEY env var');
  return key;
}

const ZERNIO_DEBUG = process.env.ZERNIO_DEBUG === '1' || process.env.ZERNIO_DEBUG === 'true';

async function zernioFetch<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url  = `${getBaseUrl()}${path}`;
  const key  = getApiKey();

  console.log(`[Zernio] → ${method} ${url}`);
  if (ZERNIO_DEBUG && body !== undefined) {
    console.log('[Zernio]   body:', JSON.stringify(body));
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Never cache — always fresh from Zernio
    cache: 'no-store',
  });

  console.log(`[Zernio] ← ${res.status} ${res.statusText}`);

  if (!res.ok) {
    let errorMsg = `Zernio API error ${res.status}`;
    try {
      const errBody = await res.json() as { message?: unknown; error?: unknown };
      if (ZERNIO_DEBUG) console.log('[Zernio]   error body:', JSON.stringify(errBody));
      const raw = errBody.message ?? errBody.error;
      if (typeof raw === 'string' && raw) {
        errorMsg = raw;
      } else if (raw != null) {
        errorMsg = JSON.stringify(raw);
      }
    } catch { /* ignore parse errors */ }
    throw new ZernioError(errorMsg, res.status);
  }

  const data = await res.json() as T;
  if (ZERNIO_DEBUG) {
    const preview = JSON.stringify(data);
    console.log('[Zernio]   response:', preview.length > 1000 ? `${preview.slice(0, 1000)}…` : preview);
  }
  return data;
}

export class ZernioError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ZernioError';
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Exchange an OAuth code for a connected Zernio account.
 * Called after the user completes the OAuth flow for a platform.
 */
export async function connectAccount(
  platform: ZernioPlatform,
  oauthCode: string,
  redirectUri: string,
): Promise<ZernioConnectResult> {
  return zernioFetch<ZernioConnectResult>('POST', '/accounts/connect', {
    platform,
    code:         oauthCode,
    redirect_uri: redirectUri,
  });
}

/**
 * List all accounts connected under the API key (workspace-level).
 */
export async function listAccounts(opts?: {
  profileId?: string;
  platform?: ZernioPlatform | string;
}): Promise<ZernioAccount[]> {
  const q = new URLSearchParams();
  if (opts?.profileId) q.set('profileId', opts.profileId);
  if (opts?.platform)  q.set('platform', opts.platform);
  const path = '/accounts' + (q.toString() ? `?${q}` : '');
  // Zernio returns `_id` in the accounts list; normalise to `id`
  const res = await zernioFetch<{ accounts: Array<ZernioAccount & { _id?: string }> }>('GET', path);
  return res.accounts.map(a => ({ ...a, id: a.id ?? a._id ?? '' }));
}

/**
 * Disconnect (revoke) an account by its Zernio ID.
 */
export async function disconnectAccount(zernioAccountId: string): Promise<void> {
  await zernioFetch<void>('DELETE', `/accounts/${encodeURIComponent(zernioAccountId)}`);
}

/**
 * Refresh an expired access token for an account.
 */
export async function refreshAccountToken(zernioAccountId: string): Promise<{
  access_token:  string;
  refresh_token: string | null;
  expires_at:    string | null;
}> {
  return zernioFetch('POST', `/accounts/${encodeURIComponent(zernioAccountId)}/refresh`);
}

// ─── Publishing ───────────────────────────────────────────────────────────────

/**
 * Publish or schedule a post via Zernio.
 * Translates from our internal payload shape to Zernio's actual API format:
 *   text → content
 *   account_id + platform → platforms:[{ platform, accountId }]
 *   image_url / media_urls / video_url → mediaItems:[{ type, url }]
 *   scheduled_at → scheduledFor  (omitted = publishNow: true)
 */
export async function publishPost(
  payload: ZernioPublishPayload,
): Promise<ZernioPublishResult> {
  // ── Build mediaItems ───────────────────────────────────────────────────────
  const mediaItems: Array<{ type: 'image' | 'video'; url: string }> = [];
  if (payload.image_url) {
    mediaItems.push({ type: 'image', url: payload.image_url });
  }
  if (Array.isArray(payload.media_urls)) {
    for (const url of payload.media_urls) {
      if (url) mediaItems.push({ type: 'image', url });
    }
  }
  if (payload.video_url) {
    mediaItems.push({ type: 'video', url: payload.video_url });
  }

  // ── Translate to Zernio format ─────────────────────────────────────────────
  // TikTok photo posts use content as the slideshow title (max 90 chars).
  // Truncate silently to avoid TIKTOK_PHOTO_TITLE_TOO_LONG rejection.
  const TIKTOK_PHOTO_TITLE_LIMIT = 90;
  let postContent = payload.text;
  if (
    payload.platform === 'tiktok' &&
    mediaItems.some((m) => m.type === 'image') &&
    postContent.length > TIKTOK_PHOTO_TITLE_LIMIT
  ) {
    postContent = postContent.slice(0, TIKTOK_PHOTO_TITLE_LIMIT - 1).trimEnd() + '…';
    console.log(`[Zernio] tiktok photo: content truncated to ${TIKTOK_PHOTO_TITLE_LIMIT} chars`);
  }

  const zernioBody: Record<string, unknown> = {
    content:   postContent,
    platforms: [{ platform: payload.platform, accountId: payload.account_id }],
    hashtags:  payload.hashtags ?? [],
  };
  if (mediaItems.length > 0) zernioBody.mediaItems = mediaItems;
  if (payload.scheduled_at) {
    zernioBody.scheduledFor = payload.scheduled_at;
  } else {
    zernioBody.publishNow = true;
  }

  // Simple idempotency key to allow safe retries within 5 min
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  console.log(
    `[Zernio] publishPost → platform=${payload.platform} accountId=${payload.account_id}` +
    ` scheduled=${payload.scheduled_at ?? 'now'} requestId=${requestId}`,
  );
  console.log('[Zernio] publishPost request body:', JSON.stringify(zernioBody));

  // ── Call Zernio ────────────────────────────────────────────────────────────
  type ZernioPostResponse = {
    post: {
      _id:          string;
      content?:     string;
      status:       string;
      scheduledFor?: string;
      platforms?:   Array<{
        platform:         string;
        accountId:        unknown;
        status:           string;
        platformPostId?:  string;
        platformPostUrl?: string;
        publishedAt?:     string;
      }>;
    };
    message?: string;
  };

  const raw = await zernioFetch<ZernioPostResponse>('POST', '/posts', zernioBody, {
    'x-request-id': requestId,
  });

  console.log('[Zernio] publishPost response:', JSON.stringify(raw));

  // ── Map response to our internal shape ────────────────────────────────────
  const platformEntry = raw.post.platforms?.[0];
  // Zernio status can be 'published' | 'scheduled' | 'pending' | 'publishing' (async)
  const rawStatus = raw.post.status as string;
  const mappedStatus: ZernioPublishResult['status'] =
    rawStatus === 'published' ? 'published' :
    rawStatus === 'scheduled' ? 'scheduled' :
    'pending';
  return {
    post_id:          raw.post._id,
    platform_post_id: platformEntry?.platformPostId ?? null,
    status:           mappedStatus,
    published_at:     platformEntry?.publishedAt ?? (payload.scheduled_at ? null : new Date().toISOString()),
    scheduled_at:     raw.post.scheduledFor ?? null,
  };
}

/**
 * Cancel a scheduled post by its Zernio post ID.
 */
export async function cancelPost(zernioPostId: string): Promise<void> {
  await zernioFetch<void>('DELETE', `/posts/${encodeURIComponent(zernioPostId)}`);
}

/**
 * Get the current status of a post (useful for async publish tracking).
 */
export async function getPostStatus(zernioPostId: string): Promise<ZernioPublishResult> {
  return zernioFetch<ZernioPublishResult>('GET', `/posts/${encodeURIComponent(zernioPostId)}`);
}

// ─── Profiles ─────────────────────────────────────────────────────────────────


/**
 * Create a Zernio profile.
 * Profiles group social accounts — one profile per Kefy organization (brand).
 */
export async function createProfile(
  name: string,
  description?: string,
): Promise<ZernioProfile> {
  const body: Record<string, string> = { name };
  if (description) body.description = description;
  const res = await zernioFetch<{ profile: ZernioProfile }>('POST', '/profiles', body);
  return res.profile;
}

// ─── Connect URL ──────────────────────────────────────────────────────────────

/**
 * Get the Zernio OAuth authorization URL for a platform.
 * Requires a profileId (from createProfile) to associate the account.
 * The user is redirected to the returned authUrl to complete OAuth.
 */
export async function getConnectUrl(
  platform: ZernioPlatform,
  profileId: string,
  redirectUrl: string,
): Promise<{ authUrl: string; state: string }> {
  const params = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  return zernioFetch<{ authUrl: string; state: string }>(
    'GET',
    `/connect/${encodeURIComponent(platform)}?${params}`,
  );
}

// ─── Account Metrics (followers) ──────────────────────────────────────────────


/**
 * Fetch follower count for a connected account.
 * Uses GET /v1/accounts/follower-stats?accountIds={id}
 * following_count and posts_count are not available via this endpoint (default 0).
 */
export async function getAccountMetrics(
  zernioAccountId: string,
): Promise<ZernioAccountMetrics> {
  const params = new URLSearchParams({ accountIds: zernioAccountId });
  const res = await zernioFetch<{
    accounts: Array<{ _id: string; currentFollowers: number }>;
  }>('GET', `/accounts/follower-stats?${params}`);
  const account = res.accounts?.[0];
  return {
    followers_count: account?.currentFollowers ?? 0,
    following_count: 0,
    posts_count:     0,
  };
}

// ─── Post Analytics ───────────────────────────────────────────────────────────


/**
 * Fetch analytics for a single published post.
 * Uses GET /v1/analytics?postId={id}
 * May return 202 (sync pending) — the caller should handle ZernioError with statusCode 202.
 */
export async function getPostAnalytics(
  zernioPostId: string,
): Promise<ZernioPostAnalytics> {
  const params = new URLSearchParams({ postId: zernioPostId });
  const res = await zernioFetch<{ analytics: ZernioPostAnalytics }>(
    'GET',
    `/analytics?${params}`,
  );
  return res.analytics;
}

// ─── Instagram Account Insights ───────────────────────────────────────────────

/**
 * Fetch account-level Instagram insights (reach, views, accounts_engaged, etc.).
 * Uses GET /v1/analytics/instagram/account-insights
 *
 * Default metrics: reach, views, accounts_engaged, total_interactions.
 * Only "reach" supports metricType=time_series; all others are total_value only.
 * Dates must be in YYYY-MM-DD format. Max 90 days range.
 * Requires the Analytics add-on on the Zernio plan.
 */
export async function getInstagramAccountInsights(params: {
  accountId:   string;
  metrics?:    string;   // comma-separated, e.g. "reach,views,likes,comments,shares,saves"
  since?:      string;   // YYYY-MM-DD
  until?:      string;   // YYYY-MM-DD
  metricType?: 'total_value' | 'time_series';
  breakdown?:  string;
}): Promise<ZernioInstagramInsights> {
  const qs = new URLSearchParams({ accountId: params.accountId });
  if (params.metrics)    qs.set('metrics',    params.metrics);
  if (params.since)      qs.set('since',      params.since);
  if (params.until)      qs.set('until',      params.until);
  if (params.metricType) qs.set('metricType', params.metricType);
  if (params.breakdown)  qs.set('breakdown',  params.breakdown);
  return zernioFetch<ZernioInstagramInsights>(
    'GET',
    `/analytics/instagram/account-insights?${qs}`,
  );
}

// ─── Messaging (DMs) ──────────────────────────────────────────────────────────

/**
 * List threads (or messages in a specific thread) for an account.
 */
export async function listMessages(
  zernioAccountId: string,
  params: ListMessagesParams = {},
): Promise<{ threads?: ZernioThread[]; messages?: ZernioMessage[] }> {
  const qs = new URLSearchParams();
  if (params.thread_id) qs.set('thread_id', params.thread_id);
  if (params.limit)     qs.set('limit', String(params.limit));
  if (params.before)    qs.set('before', params.before);
  const q = qs.toString();
  return zernioFetch(
    'GET',
    `/accounts/${encodeURIComponent(zernioAccountId)}/messages${q ? `?${q}` : ''}`,
  );
}

/**
 * Send a reply to a DM thread.
 */
export async function sendMessage(
  zernioAccountId: string,
  threadId: string,
  text: string,
): Promise<ZernioMessage> {
  return zernioFetch<ZernioMessage>(
    'POST',
    `/accounts/${encodeURIComponent(zernioAccountId)}/messages/${encodeURIComponent(threadId)}/reply`,
    { text },
  );
}

/**
 * Mark a specific message as read.
 */
export async function markMessageRead(
  zernioAccountId: string,
  messageId: string,
): Promise<void> {
  await zernioFetch<void>(
    'POST',
    `/accounts/${encodeURIComponent(zernioAccountId)}/messages/${encodeURIComponent(messageId)}/read`,
  );
}

// ─── Inbox conversations ───────────────────────────────────────────────────────

/**
 * Fetch conversations (DMs) from all connected messaging accounts.
 * Aggregates across all accounts in one call.
 * Supported platforms: Facebook, Instagram, Twitter/X, Bluesky, Reddit, Telegram.
 * Docs: https://docs.zernio.com/messages/list-inbox-conversations
 */
export async function getInboxConversations(params: {
  profileId?: string;
  platform?:  string;
  status?:    'active' | 'archived';
  sortOrder?: 'asc' | 'desc';
  limit?:     number;
  cursor?:    string;
  accountId?: string;
} = {}): Promise<ZernioInboxResponse> {
  const qs = new URLSearchParams();
  if (params.profileId) qs.set('profileId', params.profileId);
  if (params.platform)  qs.set('platform',  params.platform);
  if (params.status)    qs.set('status',     params.status);
  if (params.sortOrder) qs.set('sortOrder',  params.sortOrder);
  if (params.limit)     qs.set('limit',      String(params.limit));
  if (params.cursor)    qs.set('cursor',     params.cursor);
  if (params.accountId) qs.set('accountId',  params.accountId);
  const q = qs.toString();
  return zernioFetch<ZernioInboxResponse>('GET', `/inbox/conversations${q ? `?${q}` : ''}`);
}

// ─── Inbox conversation messages ──────────────────────────────────────────────

/**
 * Fetch messages for a specific inbox conversation.
 * GET /v1/inbox/conversations/{conversationId}/messages
 * Docs: https://docs.zernio.com/messages/get-inbox-conversation-messages
 */
export async function getConversationMessages(
  conversationId: string,
  zernioAccountId: string,
  params?: { limit?: number; cursor?: string; sortOrder?: 'asc' | 'desc' },
): Promise<ZernioInboxMessagesResponse> {
  const qs = new URLSearchParams({ accountId: zernioAccountId });
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.cursor)              qs.set('cursor', params.cursor);
  if (params?.sortOrder)           qs.set('sortOrder', params.sortOrder);
  return zernioFetch<ZernioInboxMessagesResponse>(
    'GET',
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${qs}`,
  );
}

/**
 * Send a message in an inbox conversation.
 * POST /v1/inbox/conversations/{conversationId}/messages
 * Docs: https://docs.zernio.com/messages/send-inbox-message
 */
export async function sendConversationMessage(
  conversationId: string,
  zernioAccountId: string,
  text: string,
): Promise<ZernioSendMessageResponse> {
  // Actual Zernio response: { success: true, data: { messageId, conversationId } }
  const res = await zernioFetch<{ success: boolean; data: ZernioSendMessageResponse }>(
    'POST',
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    { accountId: zernioAccountId, message: text },
  );
  return res.data;
}

// ─── Comments ─────────────────────────────────────────────────────────────────


/**
 * List comments for a post (or all recent comments for an account).
 */
export async function listComments(
  zernioAccountId: string,
  postId?: string,
): Promise<ZernioComment[]> {
  const qs = postId ? `?post_id=${encodeURIComponent(postId)}` : '';
  const res = await zernioFetch<{ comments: ZernioComment[] }>(
    'GET',
    `/accounts/${encodeURIComponent(zernioAccountId)}/comments${qs}`,
  );
  return res.comments;
}

/**
 * Reply to a comment.
 * Endpoint: POST /v1/inbox/comments/{postId}
 */
export async function replyToComment(
  zernioAccountId: string,
  postId: string,
  commentId: string,
  text: string,
): Promise<{ success: boolean; data: { commentId: string; isReply: boolean } }> {
  return zernioFetch<{ success: boolean; data: { commentId: string; isReply: boolean } }>(
    'POST',
    `/inbox/comments/${encodeURIComponent(postId)}`,
    { accountId: zernioAccountId, message: text, commentId },
  );
}

// ─── Ads / Boost ──────────────────────────────────────────────────────────────

/**
 * Boost an existing published post.
 */
export async function boostPost(
  payload: ZernioBoostPayload,
): Promise<ZernioBoostResult> {
  return zernioFetch<ZernioBoostResult>('POST', '/ads/boost', payload);
}

/**
 * List boosts — optionally scoped to a Zernio account.
 */
export async function listBoosts(
  zernioAccountId?: string,
): Promise<ZernioBoostResult[]> {
  const qs = zernioAccountId ? `?account_id=${encodeURIComponent(zernioAccountId)}` : '';
  const res = await zernioFetch<{ boosts: ZernioBoostResult[] }>('GET', `/ads/boost${qs}`);
  return res.boosts;
}

/**
 * Cancel an active boost by its Zernio boost ID.
 */
export async function cancelBoost(zernioBoostId: string): Promise<void> {
  await zernioFetch<void>('DELETE', `/ads/boost/${encodeURIComponent(zernioBoostId)}`);
}
