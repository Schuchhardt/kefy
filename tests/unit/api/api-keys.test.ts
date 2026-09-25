// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { GET, POST } from '@/app/api/api-keys/route';
import { DELETE } from '@/app/api/api-keys/[keyId]/route';
import { getAuthFromRequest, hashToken } from '@/lib/auth';
import { authenticateApiKey, API_KEY_RE, MAX_ACTIVE_API_KEYS } from '@/lib/assistant/api-keys';
import type { JWTPayload } from '@/types/auth';

// Gestión de API keys: solo owner/admin, el secreto sale una única vez, en la
// base solo queda el hash, y revocar corta la key en la petición siguiente.

function post(body: unknown) {
  return new NextRequest('http://localhost:3099/api/api-keys', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
const get = () => new NextRequest('http://localhost:3099/api/api-keys');
function del(id: string) {
  return DELETE(new NextRequest(`http://localhost:3099/api/api-keys/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ keyId: id }),
  });
}
function as(auth: JWTPayload | null) {
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.mocked(getAuthFromRequest).mockReset();
  seedWorkspace(db);
  as(AUTH);
});

describe('permisos', () => {
  it('401 sin sesión', async () => {
    as(null);
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post({ name: 'x', scopes: ['read'] }))).status).toBe(401);
    expect((await del(IDS.KEY)).status).toBe(401);
  });

  it('un miembro no ve, ni crea, ni revoca keys (403)', async () => {
    as({ ...AUTH, userId: IDS.USER_2, role: 'member' });
    expect((await GET(get())).status).toBe(403);
    expect((await POST(post({ name: 'x', scopes: ['read'] }))).status).toBe(403);
    expect((await del(IDS.KEY)).status).toBe(403);
    expect(db.rows('kefy_api_keys')).toHaveLength(0);
  });

  it('un admin sí puede crear', async () => {
    as({ ...AUTH, role: 'admin' });
    expect((await POST(post({ name: 'x', scopes: ['read'] }))).status).toBe(201);
  });
});

describe('POST /api/api-keys', () => {
  it('devuelve el secreto una vez y guarda solo su hash', async () => {
    const res = await POST(post({ name: 'Zapier', scopes: ['read', 'write', 'read'] }));

    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body.secret).toMatch(API_KEY_RE);
    expect(body.key).toMatchObject({ name: 'Zapier', prefix: body.secret.slice(0, 12), scopes: ['read', 'write'], brand_id: null });
    expect(body.key.key_hash).toBeUndefined();

    const row = db.rows('kefy_api_keys')[0];
    expect(row.key_hash).toBe(hashToken(body.secret));
    expect(JSON.stringify(row)).not.toContain(body.secret);
    expect(row).toMatchObject({ org_id: IDS.ORG, created_by: IDS.USER, expires_at: null });
  });

  it('la key creada autentica con los scopes pedidos', async () => {
    const { secret } = await (await POST(post({ name: 'CI', scopes: ['read'] }))).json();

    const r = await authenticateApiKey(new Request('https://x', { headers: { authorization: `Bearer ${secret}` } }));

    expect(r.ok && r.value.key.scopes).toEqual(['read']);
  });

  it('expires_in_days fija la caducidad', async () => {
    const before = Date.now();
    const { key } = await (await POST(post({ name: 'x', scopes: ['read'], expires_in_days: 30 }))).json();
    const days = (Date.parse(key.expires_at) - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
  });

  it('se puede atar a una marca activa de la organización', async () => {
    const res = await POST(post({ name: 'x', scopes: ['read'], brand_id: IDS.BRAND_2 }));
    expect(res.status).toBe(201);
    expect(db.rows('kefy_api_keys')[0].brand_id).toBe(IDS.BRAND_2);
  });

  it.each([
    ['de otra organización', IDS.OTHER_BRAND],
    ['archivada', IDS.ARCHIVED_BRAND],
  ])('no se puede atar a una marca %s (404)', async (_n, brandId) => {
    const res = await POST(post({ name: 'x', scopes: ['read'], brand_id: brandId }));
    expect(res.status).toBe(404);
    expect(db.rows('kefy_api_keys')).toHaveLength(0);
  });

  it.each([
    ['sin scopes', { name: 'x', scopes: [] }],
    ['scope desconocido', { name: 'x', scopes: ['admin'] }],
    ['sin nombre', { name: '  ', scopes: ['read'] }],
    ['caducidad fuera de rango', { name: 'x', scopes: ['read'], expires_in_days: 999 }],
    ['brand_id que no es uuid', { name: 'x', scopes: ['read'], brand_id: 'abc' }],
  ])('422 %s', async (_n, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(422);
    expect((await res.json()).issues).toBeDefined();
  });

  it('400 con un cuerpo que no es JSON', async () => {
    const res = await POST(new NextRequest('http://localhost:3099/api/api-keys', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });

  it('sin suscripción activa no se emiten keys (402)', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);

    const res = await POST(post({ name: 'x', scopes: ['read'] }));

    expect(res.status).toBe(402);
    expect((await res.json()).subscriptionRequired).toBe(true);
    expect(db.rows('kefy_api_keys')).toHaveLength(0);
  });

  it(`409 al llegar a ${MAX_ACTIVE_API_KEYS} keys activas; las revocadas y caducadas no cuentan`, async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    db.seed('kefy_api_keys', [
      ...Array.from({ length: MAX_ACTIVE_API_KEYS - 1 }, (_, i) => ({ org_id: IDS.ORG, key_hash: `h${i}`, key_prefix: 'p', name: `k${i}`, scopes: ['read'] })),
      { org_id: IDS.ORG, key_hash: 'rev', key_prefix: 'p', name: 'rev', scopes: ['read'], revoked_at: past },
      { org_id: IDS.ORG, key_hash: 'exp', key_prefix: 'p', name: 'exp', scopes: ['read'], expires_at: past },
      { org_id: IDS.OTHER_ORG, key_hash: 'other', key_prefix: 'p', name: 'other', scopes: ['read'] },
    ]);

    expect((await POST(post({ name: 'última', scopes: ['read'] }))).status).toBe(201);
    const res = await POST(post({ name: 'sobra', scopes: ['read'] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/limit/i);
  });
});

describe('GET /api/api-keys', () => {
  it('lista solo las keys de la organización, sin el hash y con su estado', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    db.seed('kefy_api_keys', [
      { id: IDS.uuid(31), org_id: IDS.ORG, key_hash: 'h1', key_prefix: 'kefy_sk_aaaa', name: 'activa', scopes: ['read'], created_by: IDS.USER, kefy_users: { name: 'Seba', email: 's@x' } },
      { id: IDS.uuid(32), org_id: IDS.ORG, key_hash: 'h2', key_prefix: 'kefy_sk_bbbb', name: 'revocada', scopes: ['read'], revoked_at: past, kefy_users: null },
      { id: IDS.uuid(33), org_id: IDS.ORG, key_hash: 'h3', key_prefix: 'kefy_sk_cccc', name: 'caducada', scopes: ['read'], expires_at: past },
      { id: IDS.uuid(34), org_id: IDS.OTHER_ORG, key_hash: 'h4', key_prefix: 'kefy_sk_dddd', name: 'ajena', scopes: ['read'] },
    ]);

    const res = await GET(get());
    const { keys } = await res.json();

    expect(res.status).toBe(200);
    expect(keys.map((k: { name: string }) => k.name).sort()).toEqual(['activa', 'caducada', 'revocada']);
    const byName = Object.fromEntries(keys.map((k: { name: string }) => [k.name, k]));
    expect(byName.activa.status).toBe('active');
    expect(byName.revocada.status).toBe('revoked');
    expect(byName.caducada.status).toBe('expired');
    expect(byName.activa.created_by_user).toEqual({ name: 'Seba', email: 's@x' });
    expect(JSON.stringify(keys)).not.toMatch(/key_hash|"h1"/);
  });
});

describe('DELETE /api/api-keys/[keyId]', () => {
  it('revoca la key y deja de autenticar al instante (la fila se conserva para la auditoría)', async () => {
    const { key, secret } = await (await POST(post({ name: 'x', scopes: ['read'] }))).json();
    const authReq = () => new Request('https://x', { headers: { authorization: `Bearer ${secret}` } });
    expect((await authenticateApiKey(authReq())).ok).toBe(true);

    const res = await del(key.id);

    expect(res.status).toBe(204);
    expect(db.rows('kefy_api_keys')).toHaveLength(1);
    expect(db.rows('kefy_api_keys')[0].revoked_at).toBeTruthy();
    expect(await authenticateApiKey(authReq())).toMatchObject({ ok: false, status: 401 });
  });

  it('revocar dos veces → 404 la segunda', async () => {
    const { key } = await (await POST(post({ name: 'x', scopes: ['read'] }))).json();
    expect((await del(key.id)).status).toBe(204);
    expect((await del(key.id)).status).toBe(404);
  });

  it('no puede revocar la key de otra organización', async () => {
    db.seed('kefy_api_keys', [{ id: IDS.uuid(34), org_id: IDS.OTHER_ORG, key_hash: 'h4', key_prefix: 'p', name: 'ajena', scopes: ['read'] }]);

    expect((await del(IDS.uuid(34))).status).toBe(404);
    expect(db.rows('kefy_api_keys')[0].revoked_at).toBeNull();
  });

  it('un id que no es uuid → 404 sin consultar', async () => {
    expect((await del('nope')).status).toBe(404);
    expect(db.log.filter((l) => l.table === 'kefy_api_keys')).toHaveLength(0);
  });
});
