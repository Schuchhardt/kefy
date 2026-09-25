// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState, quotaState } from '../helpers/quota';
import { IDS, seedWorkspace } from '../helpers/assistant';
import { registerTestTools, testToolCalls } from '../helpers/test-tools';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { GET as listToolsRoute } from '@/app/api/v1/tools/route';
import { POST as callToolRoute } from '@/app/api/v1/tools/[name]/route';
import { GET as meRoute } from '@/app/api/v1/me/route';
import { generateApiKey } from '@/lib/assistant/api-keys';
import { ensureToolsRegistered } from '@/lib/assistant/tools';

// API REST pública: todo error sale como { ok: false, error: { code, message },
// ...detalles }, nada se cachea, y la key manda (scopes, marca, revocación).

let secret = '';

function seedKey(over: Record<string, unknown> = {}) {
  const k = generateApiKey();
  secret = k.raw;
  db.seed('kefy_api_keys', [{
    id: IDS.KEY, org_id: IDS.ORG, created_by: IDS.USER, name: 'CI', key_prefix: k.prefix, key_hash: k.hash,
    scopes: ['read', 'write', 'publish'], ...over,
  }]);
}

function headers(extra: Record<string, string> = {}, token: string | null = secret) {
  return { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
}

function call(name: string, body?: unknown, extra: Record<string, string> = {}, token: string | null = secret) {
  const req = new NextRequest(`http://localhost:3099/api/v1/tools/${name}`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', ...extra }, token),
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return callToolRoute(req, { params: Promise.resolve({ name }) });
}

const list = (token: string | null = secret) =>
  listToolsRoute(new NextRequest('http://localhost:3099/api/v1/tools', { headers: headers({}, token) }));

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  testToolCalls.length = 0;
  ensureToolsRegistered();
  registerTestTools();
  seedWorkspace(db);
  seedKey();
});

describe('autenticación', () => {
  it('401 sin key: WWW-Authenticate, no-store y el formato de error común', async () => {
    const res = await list(null);

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="kefy"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('unauthorized');
    expect(typeof body.error.message).toBe('string');
  });

  it('401 con una key revocada', async () => {
    db.rows('kefy_api_keys')[0].revoked_at = new Date().toISOString();
    const res = await call('test_echo', { text: 'x', brand_id: IDS.BRAND });
    expect(res.status).toBe(401);
    expect(testToolCalls).toHaveLength(0);
  });

  it('429 con Retry-After cuando la key supera su rate limit', async () => {
    quotaState.rateLimited = true;
    const res = await list();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect((await res.json()).error.code).toBe('rate_limited');
  });

  it('una cookie de sesión no sirve: solo Bearer', async () => {
    const res = await listToolsRoute(new NextRequest('http://localhost:3099/api/v1/tools', {
      headers: { cookie: 'kefy_access=abc' },
    }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/tools', () => {
  it('lista las herramientas de los scopes de la key, con su esquema y brand_id', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read'];

    const res = await list();
    const { tools } = await res.json();
    const names = tools.map((t: { name: string }) => t.name);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(names).toContain('test_echo');
    expect(names).not.toContain('test_write');
    expect(names).not.toContain('publish_content');
    // Exclusiva del chat.
    expect(names).not.toContain('open_page');
    expect(tools.every((t: { kind: string }) => t.kind === 'read')).toBe(true);
    const echo = tools.find((t: { name: string }) => t.name === 'test_echo');
    expect(echo.input_schema.properties.brand_id).toBeDefined();
  });

  it('una key atada a una marca no ve brand_id en los esquemas', async () => {
    db.rows('kefy_api_keys')[0].brand_id = IDS.BRAND;
    const { tools } = await (await list()).json();
    const echo = tools.find((t: { name: string }) => t.name === 'test_echo');
    expect(echo.input_schema.properties.brand_id).toBeUndefined();
  });
});

describe('POST /api/v1/tools/[name]', () => {
  it('ejecuta y devuelve { ok, data, links } con enlaces absolutos', async () => {
    const res = await call('test_echo', { text: 'hola', brand_id: IDS.BRAND_2 });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { echo: 'hola', brand_id: IDS.BRAND_2 } });
    expect(body.links[0].href).toMatch(/^https?:\/\/.+\/en\/dashboard\/content\/create$/);
    expect(testToolCalls[0]).toMatchObject({ source: 'api', brandId: IDS.BRAND_2 });
  });

  it('Accept-Language: es cambia el idioma de la herramienta', async () => {
    const body = await (await call('test_echo', { text: 'x', brand_id: IDS.BRAND }, { 'accept-language': 'es' })).json();
    expect(body.links[0].href).toMatch(/\/es\/dashboard\//);
  });

  it('con varias marcas y sin brand_id → 400 brand_required con la lista en los detalles', async () => {
    const res = await call('test_echo', { text: 'x' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('brand_required');
    expect(body.brands.map((b: { id: string }) => b.id).sort()).toEqual([IDS.BRAND, IDS.BRAND_2].sort());
  });

  it('una key atada a una marca no actúa sobre otra', async () => {
    db.rows('kefy_api_keys')[0].brand_id = IDS.BRAND;

    const res = await call('test_echo', { text: 'x', brand_id: IDS.BRAND_2 });

    expect(res.status).toBe(403);
    expect(testToolCalls).toHaveLength(0);
  });

  it('herramienta desconocida → 404 not_found', async () => {
    const res = await call('no_existe', {});
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('una herramienta exclusiva del chat no se puede llamar por la API', async () => {
    const res = await call('open_page', { page: 'home', brand_id: IDS.BRAND });
    expect(res.status).toBe(404);
  });

  it('sin el scope → 403 scope_denied', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read'];
    const res = await call('test_write', { text: 'x', brand_id: IDS.BRAND });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('scope_denied');
  });

  it('entrada inválida → 422 con issues en los detalles y error como objeto', async () => {
    const res = await call('test_echo', { text: 42, brand_id: IDS.BRAND });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: 'invalid_input' });
    expect(typeof body.error).toBe('object');
    expect(body.issues).toBeDefined();
  });

  it('cuerpo vacío equivale a {}', async () => {
    db.rows('kefy_api_keys')[0].brand_id = IDS.BRAND;
    const res = await call('test_echo', undefined);
    // Falla por validación (falta text), no por JSON.
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('invalid_input');
  });

  it('JSON inválido → 400 invalid_json', async () => {
    const res = await call('test_echo', '{nope');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
  });

  it('las cabeceras de un error de la herramienta se reenvían (Retry-After)', async () => {
    const res = await call('test_limited', { brand_id: IDS.BRAND });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: 'rate_limited', message: 'Slow down' }, retryAfter: 7 });
  });

  it('con el trial vencido una escritura → 402 con subscriptionRequired en los detalles', async () => {
    db.rows('kefy_subscriptions').forEach((s) => { s.current_period_end = new Date(Date.now() - 1000).toISOString(); });

    const res = await call('test_write', { text: 'x', brand_id: IDS.BRAND });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe('subscription_required');
    expect(body.subscriptionRequired).toBe(true);
  });
});

describe('Idempotency-Key', () => {
  it('repetir la misma petición devuelve el mismo resultado sin volver a ejecutar', async () => {
    const a = await call('test_write', { text: 'x', brand_id: IDS.BRAND }, { 'idempotency-key': 'abc' });
    const b = await call('test_write', { text: 'x', brand_id: IDS.BRAND }, { 'idempotency-key': 'abc' });

    expect(a.status).toBe(200);
    expect(await b.json()).toEqual(await a.json());
    expect(testToolCalls).toHaveLength(1);
  });

  it('la misma key con otro cuerpo → 422 idempotency_mismatch', async () => {
    await call('test_write', { text: 'x', brand_id: IDS.BRAND }, { 'idempotency-key': 'abc' });
    const res = await call('test_write', { text: 'y', brand_id: IDS.BRAND }, { 'idempotency-key': 'abc' });

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('idempotency_mismatch');
  });

  it.each([
    ['vacía', '   '],
    ['de más de 200 caracteres', 'k'.repeat(201)],
  ])('una Idempotency-Key %s → 400', async (_n, key) => {
    const res = await call('test_write', { text: 'x', brand_id: IDS.BRAND }, { 'idempotency-key': key });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_idempotency_key');
    expect(testToolCalls).toHaveLength(0);
  });
});

describe('GET /api/v1/me', () => {
  it('describe la key: organización, rol actual, scopes, marcas y créditos', async () => {
    const res = await meRoute(new NextRequest('http://localhost:3099/api/v1/me', { headers: headers() }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      org: { id: IDS.ORG, name: 'Acme', plan: 'starter' },
      role: 'owner',
      scopes: ['read', 'write', 'publish'],
      key: { id: IDS.KEY },
      bound_brand: null,
    });
    expect(body.brands.map((b: { id: string }) => b.id).sort()).toEqual([IDS.BRAND, IDS.BRAND_2].sort());
    expect(body.credits).toMatchObject({ limit: expect.any(Number) });
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it('con una key atada solo aparece su marca', async () => {
    db.rows('kefy_api_keys')[0].brand_id = IDS.BRAND_2;
    const body = await (await meRoute(new NextRequest('http://localhost:3099/api/v1/me', { headers: headers() }))).json();

    expect(body.bound_brand).toEqual({ id: IDS.BRAND_2, name: 'Acme Bar' });
    expect(body.brands).toEqual([{ id: IDS.BRAND_2, name: 'Acme Bar' }]);
  });
});
