// lib/zernio.ts
// Zernio social publishing API client.
//
// Required env vars:
//   ZERNIO_API_KEY  — your Zernio API key
//   ZERNIO_API_URL  — base URL (default: https://api.zernio.com/v1)
//
// Zernio acts as an abstraction layer over LinkedIn, Meta, X, TikTok, etc.
// This client wraps its REST API with typed methods.

export type ZernioPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads';

export interface ZernioAccount {
  id:           string;   // Zernio account ID
  platform:     ZernioPlatform;
  external_id:  string;   // native platform user/page ID
  username:     string;
  avatar_url:   string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null; // ISO date
}

export interface ZernioPublishPayload {
  account_id:    string;        // Zernio account ID
  text:          string;
  image_url?:    string;        // single cover image (post / reel cover)
  media_urls?:   string[];      // ordered slide images for carousels
  video_url?:    string;        // rendered video asset URL for reels
  content_type?: 'post' | 'carousel' | 'reel';  // default 'post'
  hashtags?:     string[];
  scheduled_at?: string;        // ISO 8601 — omit for immediate publish
}

export interface ZernioPublishResult {
  post_id:        string;   // Zernio post ID
  platform_post_id: string | null; // native platform ID (may be async)
  status:         'published' | 'scheduled' | 'pending';
  published_at:   string | null;
  scheduled_at:   string | null;
}

export interface ZernioConnectResult {
  account:      ZernioAccount;
  access_token: string;
  refresh_token: string | null;
  expires_at:   string | null;
}

// ─── Client ───────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (process.env.ZERNIO_API_URL ?? 'https://api.zernio.com/v1').replace(/\/$/, '');
}

function getApiKey(): string {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error('Missing ZERNIO_API_KEY env var');
  return key;
}

async function zernioFetch<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const url  = `${getBaseUrl()}${path}`;
  const key  = getApiKey();

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Never cache — always fresh from Zernio
    cache: 'no-store',
  });

  if (!res.ok) {
    let errorMsg = `Zernio API error ${res.status}`;
    try {
      const errBody = await res.json() as { message?: string; error?: string };
      errorMsg = errBody.message ?? errBody.error ?? errorMsg;
    } catch { /* ignore parse errors */ }
    throw new ZernioError(errorMsg, res.status);
  }

  return res.json() as Promise<T>;
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
export async function listAccounts(): Promise<ZernioAccount[]> {
  const res = await zernioFetch<{ accounts: ZernioAccount[] }>('GET', '/accounts');
  return res.accounts;
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
 * Pass `scheduled_at` (ISO 8601) to schedule; omit for immediate publish.
 */
export async function publishPost(
  payload: ZernioPublishPayload,
): Promise<ZernioPublishResult> {
  return zernioFetch<ZernioPublishResult>('POST', '/posts', payload);
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

// ─── OAuth URL helper ─────────────────────────────────────────────────────────

/**
 * Build the Zernio OAuth authorization URL for a platform.
 * The user is redirected here to connect their account.
 */
export function buildOAuthUrl(
  platform: ZernioPlatform,
  redirectUri: string,
  state: string,
): string {
  const base = getBaseUrl();
  const params = new URLSearchParams({
    platform,
    redirect_uri: redirectUri,
    state,
  });
  return `${base}/oauth/authorize?${params.toString()}`;
}

// ─── Account Metrics (followers) ──────────────────────────────────────────────

export interface ZernioAccountMetrics {
  followers_count: number;
  following_count: number;
  posts_count:     number;
}

/**
 * Fetch follower / following / post counts for a connected account.
 */
export async function getAccountMetrics(
  zernioAccountId: string,
): Promise<ZernioAccountMetrics> {
  return zernioFetch<ZernioAccountMetrics>(
    'GET',
    `/accounts/${encodeURIComponent(zernioAccountId)}/metrics`,
  );
}

// ─── Messaging (DMs) ──────────────────────────────────────────────────────────

export interface ZernioMessage {
  message_id:    string;
  thread_id:     string;
  sender_id:     string;
  sender_name:   string | null;
  sender_avatar: string | null;
  body:          string;
  direction:     'inbound' | 'outbound';
  read_at:       string | null;
  created_at:    string;
}

export interface ZernioThread {
  thread_id:         string;
  participant_id:    string;
  participant_name:  string | null;
  participant_avatar: string | null;
  last_message_body: string;
  last_message_at:   string;
  unread_count:      number;
}

export interface ListMessagesParams {
  thread_id?: string;
  limit?:     number;
  before?:    string; // ISO cursor for pagination
}

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

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface ZernioComment {
  comment_id:    string;
  post_id:       string;
  author_id:     string;
  author_name:   string | null;
  author_avatar: string | null;
  body:          string;
  created_at:    string;
}

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
 */
export async function replyToComment(
  zernioAccountId: string,
  commentId: string,
  text: string,
): Promise<ZernioComment> {
  return zernioFetch<ZernioComment>(
    'POST',
    `/accounts/${encodeURIComponent(zernioAccountId)}/comments/${encodeURIComponent(commentId)}/reply`,
    { text },
  );
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface ZernioReview {
  review_id:       string;
  reviewer_id:     string;
  reviewer_name:   string | null;
  reviewer_avatar: string | null;
  rating:          number | null;
  body:            string | null;
  published_at:    string | null;
}

/**
 * List reviews for a connected account (Facebook, LinkedIn).
 */
export async function listReviews(
  zernioAccountId: string,
): Promise<ZernioReview[]> {
  const res = await zernioFetch<{ reviews: ZernioReview[] }>(
    'GET',
    `/accounts/${encodeURIComponent(zernioAccountId)}/reviews`,
  );
  return res.reviews;
}

/**
 * Reply to a review.
 */
export async function replyToReview(
  zernioAccountId: string,
  reviewId: string,
  text: string,
): Promise<void> {
  await zernioFetch<void>(
    'POST',
    `/accounts/${encodeURIComponent(zernioAccountId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    { text },
  );
}

// ─── Ads / Boost ──────────────────────────────────────────────────────────────

export type ZernioBoostObjective = 'reach' | 'engagement' | 'traffic' | 'leads';

export interface ZernioBoostPayload {
  account_id:    string;
  post_id:       string;          // Zernio post ID (zernio_post_id)
  budget_cents:  number;
  currency:      string;
  duration_days: number;
  objective:     ZernioBoostObjective;
  targeting?:    Record<string, unknown>;
}

export interface ZernioBoostResult {
  boost_id:       string;
  platform_ad_id: string | null;
  status:         'pending' | 'active' | 'completed' | 'cancelled' | 'failed';
  started_at:     string | null;
  ended_at:       string | null;
}

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
