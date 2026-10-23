// @vitest-environment node
//
// Entorno node: el Request de happy-dom descarta la cabecera Origin.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState, subscriptionState } from '../helpers/quota';
import { IDS, AUTH, seedWorkspace, seedSubscriptions } from '../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/route';
import { GET as protectedResourceMcp } from '@/app/.well-known/oauth-protected-resource/api/mcp/route';
import { GET as authServer } from '@/app/.well-known/oauth-authorization-server/route';
import { POST as register } from '@/app/api/oauth/register/route';
import { GET as consentGet, POST as consentPost } from '@/app/api/oauth/consent/route';
import { POST as token } from '@/app/api/oauth/token/route';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { POST as createKey } from '@/app/api/api-keys/route';
import { DELETE as revokeKey } from '@/app/api/api-keys/[keyId]/route';
import { getAuthFromRequest } from '@/lib/auth';
import { MAX_ACTIVE_API_KEYS } from '@/lib/assistant/api-keys';
import { isAllowedResource, isValidRedirectUri } from '@/lib/assistant/oauth';
import type { JWTPayload } from '@/types/auth';

// OAuth 2.1 del servidor MCP: lo que hace un conector de claude.ai, de punta a
// punta. Descubrimiento → registro → consentimiento → código + PKCE → tokens
// → /api/mcp → refresh con rotación → revocación desde Ajustes.

const BASE = 'http://localhost:3099';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a'.repeat(20) + '-._~' + 'b'.repeat(30);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function as(auth: JWTPayload | null) {
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
}

const get = (path: string) => new NextRequest(`${BASE}${path}`);

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function postForm(path: string, params: Record<string, string>) {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

async function registerClient(body: Record<string, unknown> = {}) {
  const res = await register(postJson('/api/oauth/register', {
    client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', ...body,
  }));
  return { res, body: await res.json() };
}

function authorizeQuery(clientId: string, over: Record<string, string | null> = {}) {
  const params: Record<string, string | null> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'xyz',
    resource: `${BASE}/api/mcp`,
    ...over,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null) q.set(k, v);
  return q.toString();
}

async function approve(clientId: string, body: Record<string, unknown> = {}) {
  const res = await consentPost(postJson('/api/oauth/consent', {
    query: authorizeQuery(clientId), decision: 'approve', scopes: ['read', 'write'], ...body,
  }, { origin: BASE }));
  return { res, body: await res.json() };
}

async function exchange(clientId: string, code: string, over: Record<string, string> = {}) {
  const res = await token(postForm('/api/oauth/token', {
    grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT,
    code_verifier: VERIFIER, resource: `${BASE}/api/mcp`, ...over,
  }));
  return { res, body: await res.json() };
}

async function refresh(clientId: string, refreshToken: string) {
  const res = await token(postForm('/api/oauth/token', {
    grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId,
  }));
  return { res, body: await res.json() };
}

/** Registro + consentimiento + canje: devuelve el cliente y los tokens. */
async function connect(body: Record<string, unknown> = {}) {
  const { body: client } = await registerClient();
  const { body: decision } = await approve(client.client_id, body);
  const code = new URL(decision.redirect).searchParams.get('code')!;
  const { body: tokens } = await exchange(client.client_id, code);
  return { clientId: client.client_id as string, tokens };
}

function mcp(accessToken: string | null, method = 'ping') {
  return mcpPost(new NextRequest(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
  }));
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.mocked(getAuthFromRequest).mockReset();
  seedWorkspace(db);
  as(AUTH);
});

// ─── Descubrimiento ──────────────────────────────────────────────────────────

describe('metadatos', () => {
  it('el recurso protegido apunta al servidor de autorización de la propia app', async () => {
    for (const handler of [protectedResource, protectedResourceMcp]) {
      const body = await handler(get('/.well-known/oauth-protected-resource')).json();
      expect(body).toMatchObject({
        resource: `${BASE}/api/mcp`,
        authorization_servers: [BASE],
        scopes_supported: ['read', 'write', 'publish'],
      });
    }
  });

  it('el servidor de autorización anuncia PKCE S256, registro dinámico y clientes públicos', async () => {
    const res = authServer(get('/.well-known/oauth-authorization-server'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/api/oauth/token`,
      registration_endpoint: `${BASE}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
  });

  it('el 401 de /api/mcp lleva a los metadatos', async () => {
    const res = await mcp(null);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain(
      `resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });
});

// ─── Registro ────────────────────────────────────────────────────────────────

describe('POST /api/oauth/register', () => {
  it('registra un cliente público', async () => {
    const { res, body } = await registerClient();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none',
    });
    expect(body.client_secret).toBeUndefined();
    expect(db.rows('kefy_oauth_clients')).toHaveLength(1);
  });

  it('rechaza redirect_uris peligrosas y clientes con secreto', async () => {
    for (const uri of ['javascript:alert(1)', 'http://evil.example/cb', 'https://x.example/cb#frag', 'data:text/html,hi']) {
      expect((await registerClient({ redirect_uris: [uri] })).res.status).toBe(400);
    }
    expect((await registerClient({ redirect_uris: [] })).res.status).toBe(400);
    expect((await registerClient({ token_endpoint_auth_method: 'client_secret_basic' })).res.status).toBe(400);
    expect(db.rows('kefy_oauth_clients')).toHaveLength(0);
  });

  it('acepta loopback http y esquemas de apps de escritorio', () => {
    expect(isValidRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isValidRedirectUri('http://127.0.0.1:33418/')).toBe(true);
    expect(isValidRedirectUri('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true);
    expect(isValidRedirectUri('file:///etc/passwd')).toBe(false);
  });
});

// ─── Consentimiento ──────────────────────────────────────────────────────────

describe('/api/oauth/consent', () => {
  it('describe la solicitud a quien tiene sesión', async () => {
    const { body: client } = await registerClient();
    const res = await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id)}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      client: { name: 'Claude', redirect_host: 'claude.ai' },
      org_name: 'Acme',
      can_authorize: true,
      default_scopes: ['read', 'write'],
    });
    expect(body.brands.map((b: { id: string }) => b.id)).toEqual([IDS.BRAND, IDS.BRAND_2]);
  });

  it('sin sesión → 401', async () => {
    as(null);
    const { body: client } = await registerClient();
    expect((await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id)}`))).status).toBe(401);
  });

  it('cliente desconocido o redirect_uri no registrada → error sin redirigir', async () => {
    const { body: client } = await registerClient();
    const unknown = await consentGet(get(`/api/oauth/consent?${authorizeQuery(IDS.uuid(999))}`));
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).code).toBe('invalid_client');

    const evil = await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id, { redirect_uri: 'https://evil.example/cb' })}`));
    expect(evil.status).toBe(400);
    const body = await evil.json();
    expect(body.code).toBe('invalid_redirect_uri');
    expect(body.redirect).toBeUndefined();
  });

  it('sin PKCE o con otro recurso → vuelve al cliente con el error', async () => {
    const { body: client } = await registerClient();
    const noPkce = await (await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id, { code_challenge_method: 'plain' })}`))).json();
    const url = new URL(noPkce.redirect);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('error')).toBe('invalid_request');
    expect(url.searchParams.get('state')).toBe('xyz');

    const otherResource = await (await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id, { resource: 'https://evil.example/api/mcp' })}`))).json();
    expect(new URL(otherResource.redirect).searchParams.get('error')).toBe('invalid_target');
  });

  it('cancelar vuelve con access_denied y no emite código', async () => {
    const { body: client } = await registerClient();
    const { body } = await approve(client.client_id, { decision: 'deny' });
    const url = new URL(body.redirect);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(db.rows('kefy_oauth_codes')).toHaveLength(0);
  });

  it('aprobar vuelve con código, state e iss', async () => {
    const { body: client } = await registerClient();
    const { res, body } = await approve(client.client_id, { brand_id: IDS.BRAND });
    expect(res.status).toBe(200);
    const url = new URL(body.redirect);
    expect(url.searchParams.get('code')).toMatch(/^kefy_ac_/);
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe(BASE);
    const [code] = db.rows('kefy_oauth_codes');
    expect(code).toMatchObject({ user_id: IDS.USER, org_id: IDS.ORG, brand_id: IDS.BRAND, scopes: ['read', 'write'] });
    // Solo el hash: el código en claro no está en la base.
    expect(JSON.stringify(code)).not.toContain(url.searchParams.get('code'));
  });

  it('un miembro no puede autorizar (igual que no puede crear keys)', async () => {
    as({ ...AUTH, userId: IDS.USER_2, role: 'member' });
    const { body: client } = await registerClient();
    const info = await (await consentGet(get(`/api/oauth/consent?${authorizeQuery(client.client_id)}`))).json();
    expect(info.can_authorize).toBe(false);
    expect((await approve(client.client_id)).res.status).toBe(403);
    expect(db.rows('kefy_oauth_codes')).toHaveLength(0);
  });

  it('una decisión desde otro origen → 403', async () => {
    const { body: client } = await registerClient();
    const res = await consentPost(postJson('/api/oauth/consent', {
      query: authorizeQuery(client.client_id), decision: 'approve', scopes: ['read'],
    }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('marca archivada o ajena → 404; sin permisos → 422', async () => {
    const { body: client } = await registerClient();
    expect((await approve(client.client_id, { brand_id: IDS.ARCHIVED_BRAND })).res.status).toBe(404);
    expect((await approve(client.client_id, { brand_id: IDS.OTHER_BRAND })).res.status).toBe(404);
    expect((await approve(client.client_id, { scopes: [] })).res.status).toBe(422);
  });

  it('sin suscripción activa no se autoriza', async () => {
    subscriptionState.status = 'canceled';
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);
    const { body: client } = await registerClient();
    expect((await approve(client.client_id)).res.status).toBe(402);
  });
});

// ─── Token ───────────────────────────────────────────────────────────────────

describe('POST /api/oauth/token', () => {
  it('canjea el código por tokens que funcionan en /api/mcp', async () => {
    const { tokens } = await connect({ brand_id: IDS.BRAND });
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read write' });
    expect(tokens.access_token).toMatch(/^kefy_at_/);
    expect(tokens.refresh_token).toMatch(/^kefy_rt_/);

    const [grant] = db.rows('kefy_api_keys');
    expect(grant).toMatchObject({
      kind: 'oauth', name: 'Claude', created_by: IDS.USER, org_id: IDS.ORG, brand_id: IDS.BRAND, scopes: ['read', 'write'],
    });
    expect(JSON.stringify(grant)).not.toContain(tokens.access_token);
    expect(JSON.stringify(grant)).not.toContain(tokens.refresh_token);

    expect((await mcp(tokens.access_token)).status).toBe(200);
  });

  it('el código es de un solo uso', async () => {
    const { body: client } = await registerClient();
    const { body: decision } = await approve(client.client_id);
    const code = new URL(decision.redirect).searchParams.get('code')!;
    expect((await exchange(client.client_id, code)).res.status).toBe(200);
    const again = await exchange(client.client_id, code);
    expect(again.res.status).toBe(400);
    expect(again.body.error).toBe('invalid_grant');
  });

  it('PKCE, redirect_uri y cliente tienen que coincidir', async () => {
    const { body: client } = await registerClient();
    const { body: other } = await registerClient();
    const cases: [string, Record<string, string>][] = [
      [client.client_id, { code_verifier: 'z'.repeat(50) }],
      [client.client_id, { redirect_uri: 'https://claude.ai/other' }],
      [other.client_id, {}],
    ];
    for (const [clientId, over] of cases) {
      const { body: decision } = await approve(client.client_id);
      const code = new URL(decision.redirect).searchParams.get('code')!;
      const { res, body } = await exchange(clientId, code, over);
      expect(res.status).toBe(400);
      expect(body.error).toBe('invalid_grant');
    }
    expect(db.rows('kefy_api_keys')).toHaveLength(0);
  });

  it('un código caducado no sirve', async () => {
    const { body: client } = await registerClient();
    const { body: decision } = await approve(client.client_id);
    db.rows('kefy_oauth_codes')[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const code = new URL(decision.redirect).searchParams.get('code')!;
    expect((await exchange(client.client_id, code)).body.error).toBe('invalid_grant');
  });

  it('grant_type desconocido → unsupported_grant_type', async () => {
    const res = await token(postForm('/api/oauth/token', { grant_type: 'password' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unsupported_grant_type');
  });

  it('el refresh rota los dos tokens: los anteriores dejan de valer', async () => {
    const { clientId, tokens } = await connect();
    const { res, body } = await refresh(clientId, tokens.refresh_token);
    expect(res.status).toBe(200);
    expect(body.access_token).not.toBe(tokens.access_token);
    expect(body.refresh_token).not.toBe(tokens.refresh_token);

    expect((await mcp(body.access_token)).status).toBe(200);
    expect((await mcp(tokens.access_token)).status).toBe(401);
    expect((await refresh(clientId, tokens.refresh_token)).body.error).toBe('invalid_grant');
    // Sigue siendo la misma conexión: no se acumulan filas.
    expect(db.rows('kefy_api_keys')).toHaveLength(1);
  });

  it('el refresh de otro cliente no sirve', async () => {
    const { tokens } = await connect();
    const { body: other } = await registerClient();
    expect((await refresh(other.client_id, tokens.refresh_token)).body.error).toBe('invalid_grant');
  });

  it('un access token caducado → 401 (el cliente usa su refresh)', async () => {
    const { tokens } = await connect();
    db.rows('kefy_api_keys')[0].access_expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await mcp(tokens.access_token);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
  });
});

// ─── Ajustes ─────────────────────────────────────────────────────────────────

describe('la conexión en Ajustes → API y MCP', () => {
  it('revocarla corta el access y el refresh token', async () => {
    const { clientId, tokens } = await connect();
    const [grant] = db.rows('kefy_api_keys');
    const res = await revokeKey(
      new NextRequest(`${BASE}/api/api-keys/${grant.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ keyId: grant.id as string }) },
    );
    expect(res.status).toBe(204);
    expect((await mcp(tokens.access_token)).status).toBe(401);
    expect((await refresh(clientId, tokens.refresh_token)).body.error).toBe('invalid_grant');
  });

  it('las conexiones OAuth no cuentan para el tope de keys', async () => {
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i++) await connect();
    const res = await createKey(postJson('/api/api-keys', { name: 'Zapier', scopes: ['read'] }));
    expect(res.status).toBe(201);
  });
});

describe('isAllowedResource', () => {
  it('solo el servidor MCP de esta app', () => {
    expect(isAllowedResource(null, BASE)).toBe(true);
    expect(isAllowedResource(`${BASE}/api/mcp`, BASE)).toBe(true);
    expect(isAllowedResource(`${BASE}/api/mcp/`, BASE)).toBe(true);
    expect(isAllowedResource(BASE, BASE)).toBe(true);
    expect(isAllowedResource(`${BASE}/api/v1`, BASE)).toBe(false);
    expect(isAllowedResource('https://evil.example/api/mcp', BASE)).toBe(false);
    expect(isAllowedResource('not a url', BASE)).toBe(false);
  });
});
