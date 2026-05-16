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
