// ─── OAuth 2.1 para el servidor MCP ──────────────────────────────────────────
//
// Lo que necesita un conector de claude.ai (o cualquier cliente MCP que siga la
// especificación de autorización) para conectarse sin pegar una API key:
//
//   1. /api/mcp responde 401 con `resource_metadata` en WWW-Authenticate.
//   2. /.well-known/oauth-protected-resource → servidor de autorización.
//   3. /.well-known/oauth-authorization-server → endpoints.
//   4. POST /api/oauth/register: registro dinámico (RFC 7591), cliente público.
//   5. /oauth/authorize → pantalla de consentimiento con la sesión de Kefy.
//   6. POST /api/oauth/token: código + PKCE (S256) → access + refresh token.
//
// Cada autorización aprobada es una fila de kefy_api_keys con kind = 'oauth'
// (ver la migración 20261021000001): el access token se valida con el mismo
// authenticateApiKey que una key, con el rol ACTUAL de quien autorizó, y se
// revoca desde Ajustes. Solo se guardan hashes; nunca se loguea un token.
//
// Las URLs se construyen con el origen de la petición y no con appUrl(): el
// cliente comprueba que `resource` sea la URL a la que se conectó y que
// `issuer` coincida con donde leyó los metadatos (www o sin www, preview…).
//
// Ver docs/assistant.md §7.

import { createHash, randomBytes } from 'node:crypto';
import { hashToken } from '@/lib/auth';
import { appUrl } from '@/lib/app-url';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { API_KEY_SCOPES, OAUTH_ACCESS_TOKEN_PREFIX as ACCESS_TOKEN_PREFIX } from '@/lib/assistant/api-keys';
import type { Scope } from '@/lib/assistant/types';

const REFRESH_TOKEN_PREFIX = 'kefy_rt_';
const REFRESH_TOKEN_RE = /^kefy_rt_[A-Za-z0-9_-]{43}$/;
const CODE_PREFIX = 'kefy_ac_';
const CODE_RE = /^kefy_ac_[A-Za-z0-9_-]{43}$/;

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
/** Una conexión sin usar caduca a los 90 días; cada refresh la renueva. */
export const CONNECTION_TTL_DAYS = 90;
const CODE_TTL_SECONDS = 10 * 60;

export const MCP_PATH = '/api/mcp';
/** Permisos que se marcan por defecto en el consentimiento: publicar es opt-in. */
export const DEFAULT_OAUTH_SCOPES: readonly Scope[] = ['read', 'write'];

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Metadatos, registro y token se pueden pedir desde el navegador (inspector
 * MCP, clientes web). No usan cookies, así que `*` no expone ninguna sesión.
 */
export const OAUTH_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
} as const;

// ─── Metadatos ───────────────────────────────────────────────────────────────

export function mcpResourceUrl(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** URL de los metadatos del recurso (RFC 9728), con la ruta del recurso detrás. */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [...API_KEY_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Kefy',
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [...API_KEY_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
  };
}

/**
 * `resource` (RFC 8707) tiene que ser el servidor MCP de esta app: el origen
 * de la petición o el canónico, con o sin la ruta. Sin `resource` vale.
 */
export function isAllowedResource(resource: string | null | undefined, origin: string): boolean {
  if (!resource) return true;
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.search || url.hash) return false;
  const origins = new Set([origin]);
  try { origins.add(new URL(appUrl()).origin); } catch { /* appUrl siempre es absoluta */ }
  const path = url.pathname.replace(/\/+$/, '');
  return origins.has(url.origin) && (path === '' || path === MCP_PATH);
}

// ─── Errores ─────────────────────────────────────────────────────────────────

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  | 'invalid_target'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata'
  | 'unsupported_response_type'
  | 'access_denied'
  | 'server_error';

export interface OAuthError {
  error: OAuthErrorCode;
  error_description: string;
}

const oauthError = (error: OAuthErrorCode, error_description: string): OAuthError => ({ error, error_description });

// ─── Utilidades ──────────────────────────────────────────────────────────────

function randomToken(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

/** BASE64URL(SHA256(verifier)) === challenge (PKCE S256). */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!PKCE_VERIFIER_RE.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

/** Añade parámetros a una redirect_uri registrada, respetando su query. */
export function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Una redirect_uri aceptable: https, http solo en loopback, o un esquema
 * propio de una app de escritorio (`cursor://…`). Nunca esquemas que ejecutan
 * o leen nada en el navegador, ni fragmentos.
 */
export function isValidRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'https') return true;
  if (scheme === 'http') return isLoopback(url.hostname);
  if (['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'ftp', 'ws', 'wss'].includes(scheme)) return false;
  return /^[a-z][a-z0-9+.-]*$/.test(scheme);
}

// ─── Registro dinámico (RFC 7591) ────────────────────────────────────────────

export interface RegisteredClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  client_id_issued_at: number;
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none';
}

export async function registerClient(
  body: unknown,
): Promise<{ ok: true; client: RegisteredClient } | { ok: false; status: 400 | 500; error: OAuthError }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: oauthError('invalid_client_metadata', 'Body must be a JSON object') };
  }
  const meta = body as Record<string, unknown>;

  const uris = meta.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return { ok: false, status: 400, error: oauthError('invalid_redirect_uri', `redirect_uris must have 1 to ${MAX_REDIRECT_URIS} entries`) };
  }
  if (!uris.every(isValidRedirectUri)) {
    return { ok: false, status: 400, error: oauthError('invalid_redirect_uri', 'Every redirect_uri must be https, loopback http or an app scheme, without fragment') };
  }

  // Solo clientes públicos: sin secreto que guardar ni que se pueda filtrar.
  const authMethod = meta.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== 'none') {
    return { ok: false, status: 400, error: oauthError('invalid_client_metadata', 'Only token_endpoint_auth_method "none" is supported (use PKCE)') };
  }
  const grants = meta.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.every((g) => g === 'authorization_code' || g === 'refresh_token'))) {
    return { ok: false, status: 400, error: oauthError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported') };
  }
  const responses = meta.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || !responses.every((r) => r === 'code'))) {
    return { ok: false, status: 400, error: oauthError('invalid_client_metadata', 'Only the "code" response type is supported') };
  }

  const rawName = typeof meta.client_name === 'string' ? meta.client_name.trim() : '';
  const clientName = (rawName || 'MCP client').slice(0, 100);
  const redirectUris = [...new Set(uris as string[])];

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_oauth_clients')
    .insert({ client_name: clientName, redirect_uris: redirectUris })
    .select('id, client_name, redirect_uris, created_at')
    .single();

  if (error || !data) {
    reportError(new Error(error?.message ?? 'Insert returned no row'), {
      route: 'POST /api/oauth/register', service: 'supabase',
    });
    return { ok: false, status: 500, error: oauthError('server_error', 'Could not register the client') };
  }

  return {
    ok: true,
    client: {
      client_id: data.id,
      client_name: data.client_name,
      redirect_uris: data.redirect_uris,
      client_id_issued_at: Math.floor(new Date(data.created_at).getTime() / 1000),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  };
}

// ─── Petición de autorización ────────────────────────────────────────────────

export interface AuthorizeRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string | null;
}

/**
 * Resultado de validar los parámetros de /oauth/authorize:
 * - `fatal`: el cliente o la redirect_uri no son de fiar → se muestra el
 *   error y NO se redirige (RFC 6749 §4.1.2.1).
 * - `redirect`: el resto de errores vuelven al cliente con `error=`.
 */
export type AuthorizeValidation =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; kind: 'fatal'; error: OAuthError }
  | { ok: false; kind: 'redirect'; redirect: string; error: OAuthError }
  | { ok: false; kind: 'unavailable' };

type ParamSource = { get(name: string): string | null };

export async function validateAuthorizeRequest(
  params: ParamSource,
  origin: string,
): Promise<AuthorizeValidation> {
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  if (!UUID_RE.test(clientId)) {
    return { ok: false, kind: 'fatal', error: oauthError('invalid_client', 'Unknown client_id') };
  }

  const db = createSupabaseServer();
  const { data: client, error } = await db
    .from('kefy_oauth_clients')
    .select('id, client_name, redirect_uris')
    .eq('id', clientId)
    .maybeSingle();
  if (error) {
    reportError(new Error(error.message), { route: 'oauth:authorize', service: 'supabase' });
    return { ok: false, kind: 'unavailable' };
  }
  if (!client) {
    return { ok: false, kind: 'fatal', error: oauthError('invalid_client', 'Unknown client_id') };
  }
  // Coincidencia exacta con una registrada: nada de prefijos ni comodines.
  if (!(client.redirect_uris as string[]).includes(redirectUri)) {
    return { ok: false, kind: 'fatal', error: oauthError('invalid_redirect_uri', 'redirect_uri is not registered for this client') };
  }

  const state = params.get('state');
  const fail = (code: OAuthErrorCode, description: string): AuthorizeValidation => {
    const err = oauthError(code, description);
    return {
      ok: false,
      kind: 'redirect',
      error: err,
      redirect: withParams(redirectUri, { error: err.error, error_description: description, state, iss: origin }),
    };
  };

  if (params.get('response_type') !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported');
  }
  const challenge = params.get('code_challenge') ?? '';
  if (params.get('code_challenge_method') !== 'S256' || !PKCE_CHALLENGE_RE.test(challenge)) {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  const resource = params.get('resource');
  if (!isAllowedResource(resource, origin)) {
    return fail('invalid_target', 'resource must be this MCP server');
  }

  return {
    ok: true,
    request: {
      clientId: client.id,
      clientName: client.client_name,
      redirectUri,
      codeChallenge: challenge,
      state,
      resource: resource || null,
    },
  };
}

/** Crea el código de autorización y devuelve la URL de vuelta al cliente. */
export async function issueAuthorizationCode(
  request: AuthorizeRequest,
  grant: { orgId: string; userId: string; brandId: string | null; scopes: Scope[] },
  origin: string,
  now = new Date(),
): Promise<string | null> {
  const code = randomToken(CODE_PREFIX);
  const db = createSupabaseServer();
  const { error } = await db.from('kefy_oauth_codes').insert({
    code_hash: hashToken(code),
    client_id: request.clientId,
    org_id: grant.orgId,
    brand_id: grant.brandId,
    user_id: grant.userId,
    scopes: grant.scopes,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    resource: request.resource,
    expires_at: new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) {
    reportError(new Error(error.message), {
      route: 'oauth:authorize', service: 'supabase', extra: { clientId: request.clientId },
    });
    return null;
  }
  return withParams(request.redirectUri, { code, state: request.state, iss: origin });
}

// ─── Token endpoint ──────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenResult =
  | { ok: true; body: TokenResponse }
  | { ok: false; status: 400 | 401 | 500 | 503; error: OAuthError };

interface CodeRow {
  client_id: string;
  org_id: string;
  brand_id: string | null;
  user_id: string;
  scopes: string[];
  redirect_uri: string;
  code_challenge: string;
  resource: string | null;
  expires_at: string;
}

function newTokenPair(now: Date) {
  const access = randomToken(ACCESS_TOKEN_PREFIX);
  const refresh = randomToken(REFRESH_TOKEN_PREFIX);
  return {
    access,
    refresh,
    columns: {
      key_hash: hashToken(access),
      key_prefix: access.slice(0, 12),
      refresh_hash: hashToken(refresh),
      access_expires_at: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
      expires_at: new Date(now.getTime() + CONNECTION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

function tokenBody(access: string, refresh: string, scopes: string[]): TokenResponse {
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: scopes.join(' '),
  };
}

const invalidGrant = (description: string): TokenResult => ({
  ok: false, status: 400, error: oauthError('invalid_grant', description),
});
const tokenServerError: TokenResult = {
  ok: false, status: 503, error: oauthError('server_error', 'Try again in a moment'),
};

/** grant_type=authorization_code: el código se consume aunque luego falle algo. */
export async function exchangeAuthorizationCode(
  params: ParamSource,
  origin: string,
  now = new Date(),
): Promise<TokenResult> {
  const code = params.get('code') ?? '';
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const verifier = params.get('code_verifier') ?? '';
  if (!CODE_RE.test(code)) return invalidGrant('Invalid authorization code');
  if (!UUID_RE.test(clientId)) {
    return { ok: false, status: 401, error: oauthError('invalid_client', 'client_id is required') };
  }

  const db = createSupabaseServer();
  // Marcarlo usado y leerlo en la misma sentencia: dos canjes simultáneos del
  // mismo código no pueden ganar los dos.
  const { data, error } = await db
    .from('kefy_oauth_codes')
    .update({ used_at: now.toISOString() })
    .eq('code_hash', hashToken(code))
    .is('used_at', null)
    .select('client_id, org_id, brand_id, user_id, scopes, redirect_uri, code_challenge, resource, expires_at')
    .maybeSingle();
  if (error) {
    reportError(new Error(error.message), { route: 'POST /api/oauth/token', service: 'supabase', extra: { step: 'code' } });
    return tokenServerError;
  }
  const row = data as CodeRow | null;
  if (!row) return invalidGrant('Invalid or already used authorization code');
  if (new Date(row.expires_at).getTime() <= now.getTime()) return invalidGrant('Authorization code expired');
  if (row.client_id !== clientId) return invalidGrant('Code was issued to another client');
  if (row.redirect_uri !== redirectUri) return invalidGrant('redirect_uri does not match');
  if (!verifyPkce(verifier, row.code_challenge)) return invalidGrant('PKCE verification failed');
  const resource = params.get('resource');
  if (resource && (!isAllowedResource(resource, origin) || (row.resource && row.resource !== resource))) {
    return { ok: false, status: 400, error: oauthError('invalid_target', 'resource does not match the authorization') };
  }

  const { data: client } = await db
    .from('kefy_oauth_clients')
    .select('client_name')
    .eq('id', clientId)
    .maybeSingle();

  const pair = newTokenPair(now);
  const { error: insertError } = await db.from('kefy_api_keys').insert({
    org_id: row.org_id,
    brand_id: row.brand_id,
    created_by: row.user_id,
    name: ((client?.client_name as string | undefined) ?? 'MCP client').slice(0, 100),
    scopes: row.scopes,
    kind: 'oauth',
    oauth_client_id: clientId,
    ...pair.columns,
  });
  if (insertError) {
    reportError(new Error(insertError.message), { route: 'POST /api/oauth/token', service: 'supabase', extra: { step: 'grant', clientId } });
    return tokenServerError;
  }

  return { ok: true, body: tokenBody(pair.access, pair.refresh, row.scopes) };
}

/**
 * grant_type=refresh_token: rota el access y el refresh token en la misma
 * fila. El refresh anterior deja de valer en el acto (un refresh robado y ya
 * usado no sirve) y la conexión vuelve a durar CONNECTION_TTL_DAYS.
 */
export async function refreshAccessToken(params: ParamSource, now = new Date()): Promise<TokenResult> {
  const refresh = params.get('refresh_token') ?? '';
  const clientId = params.get('client_id') ?? '';
  if (!REFRESH_TOKEN_RE.test(refresh)) return invalidGrant('Invalid refresh token');
  if (!UUID_RE.test(clientId)) {
    return { ok: false, status: 401, error: oauthError('invalid_client', 'client_id is required') };
  }

  const pair = newTokenPair(now);
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_api_keys')
    .update(pair.columns)
    .eq('refresh_hash', hashToken(refresh))
    .eq('kind', 'oauth')
    .eq('oauth_client_id', clientId)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .select('id, scopes')
    .maybeSingle();
  if (error) {
    reportError(new Error(error.message), { route: 'POST /api/oauth/token', service: 'supabase', extra: { step: 'refresh' } });
    return tokenServerError;
  }
  if (!data) return invalidGrant('Invalid, revoked or expired refresh token');

  return { ok: true, body: tokenBody(pair.access, pair.refresh, (data.scopes as string[]) ?? []) };
}
