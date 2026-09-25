// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { resetQuotaState, quotaState } from '../../helpers/quota';
import { IDS, seedWorkspace } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import {
  generateApiKey, authenticateApiKey, apiToolContext, apiLanguage, API_KEY_RE, API_KEY_PREFIX,
} from '@/lib/assistant/api-keys';
import { hashToken } from '@/lib/auth';
import { reportError } from '@/lib/observability';

const NOW = new Date('2026-09-23T12:00:00Z');

function req(token?: string, headers: Record<string, string> = {}) {
  return new Request('https://kefy.test/api/v1/me', {
    headers: { ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
}

/** Crea una key y guarda solo su hash, como la ruta POST /api/api-keys. */
function seedKey(over: Record<string, unknown> = {}) {
  const k = generateApiKey();
  const [row] = db.seed('kefy_api_keys', [{
    id: IDS.KEY, org_id: IDS.ORG, created_by: IDS.USER, name: 'CI', key_prefix: k.prefix, key_hash: k.hash,
    scopes: ['read', 'write'], ...over,
  }]);
  return { raw: k.raw, row };
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  vi.mocked(reportError).mockClear();
  seedWorkspace(db);
});

describe('generateApiKey', () => {
  it('formato kefy_sk_ + 43 caracteres base64url, prefijo de 12 y hash sha256', () => {
    const k = generateApiKey();

    expect(k.raw).toMatch(API_KEY_RE);
    expect(k.raw.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(k.prefix).toBe(k.raw.slice(0, 12));
    expect(k.hash).toBe(hashToken(k.raw));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.hash).not.toContain(k.raw);
  });

  it('cada key es distinta', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().raw));
    expect(keys.size).toBe(50);
  });
});

describe('authenticateApiKey', () => {
  it('autentica con el rol ACTUAL del creador y el plan de la organización', async () => {
    const { raw } = seedKey();

    const r = await authenticateApiKey(req(raw), NOW);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.key).toMatchObject({ id: IDS.KEY, org_id: IDS.ORG, brand_id: null, scopes: ['read', 'write'] });
    expect(r.value.auth).toEqual({ userId: IDS.USER, orgId: IDS.ORG, role: 'owner', plan: 'starter' });
    expect(r.value.orgName).toBe('Acme');
  });

  it('si al creador le bajan el rol, la key actúa con el rol nuevo', async () => {
    const { raw } = seedKey();
    db.rows('kefy_org_memberships').find((m) => m.user_id === IDS.USER)!.role = 'member';

    const r = await authenticateApiKey(req(raw), NOW);

    expect(r.ok && r.value.role).toBe('member');
  });

  it('busca la key por hash: nunca por el valor en claro', async () => {
    const { raw } = seedKey();
    await authenticateApiKey(req(raw), NOW);

    const lookup = db.log.find((l) => l.table === 'kefy_api_keys' && l.op === 'select');
    expect(lookup?.filters).toEqual([`key_hash=eq.${hashToken(raw)}`]);
    expect(JSON.stringify(db.log)).not.toContain(raw);
  });

  it.each([
    ['sin cabecera', undefined],
    ['formato inválido', 'kefy_sk_short'],
    ['otro prefijo', `sk_live_${'a'.repeat(43)}`],
  ])('401 %s, sin consultar la base', async (_name, token) => {
    const r = await authenticateApiKey(req(token), NOW);
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(db.log).toHaveLength(0);
  });

  it('401 con una key bien formada que no existe', async () => {
    const r = await authenticateApiKey(req(generateApiKey().raw), NOW);
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('401 con una key revocada: la revocación es inmediata', async () => {
    const { raw } = seedKey({ revoked_at: '2026-09-23T11:59:00Z' });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('401 con una key caducada (también justo en el instante de caducar)', async () => {
    const { raw } = seedKey({ expires_at: NOW.toISOString() });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('una key con caducidad futura funciona', async () => {
    const { raw } = seedKey({ expires_at: '2026-10-01T00:00:00Z' });
    expect((await authenticateApiKey(req(raw), NOW)).ok).toBe(true);
  });

  it('401 si quien la creó ya no es miembro de la organización', async () => {
    const { raw } = seedKey();
    db.rows('kefy_org_memberships').splice(0, 1);

    const r = await authenticateApiKey(req(raw), NOW);

    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('401 si quien la creó se fue a otra organización (la membresía se busca en la org de la key)', async () => {
    const { raw } = seedKey({ created_by: IDS.OTHER_USER });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('401 si el creador fue borrado (created_by null)', async () => {
    const { raw } = seedKey({ created_by: null });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('una key atada a una marca archivada deja de funcionar', async () => {
    const { raw } = seedKey({ brand_id: IDS.ARCHIVED_BRAND });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('una key atada a una marca de otra organización no funciona', async () => {
    const { raw } = seedKey({ brand_id: IDS.OTHER_BRAND });
    expect(await authenticateApiKey(req(raw), NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it('una key atada a una marca activa la conserva', async () => {
    const { raw } = seedKey({ brand_id: IDS.BRAND });
    const r = await authenticateApiKey(req(raw), NOW);
    expect(r.ok && r.value.key.brand_id).toBe(IDS.BRAND);
  });

  it('descarta scopes desconocidos', async () => {
    const { raw } = seedKey({ scopes: ['read', 'admin', 'publish'] });
    const r = await authenticateApiKey(req(raw), NOW);
    expect(r.ok && r.value.key.scopes).toEqual(['read', 'publish']);
  });

  it('429 con Retry-After cuando la key supera su rate limit (bucket propio de la key)', async () => {
    const { raw } = seedKey();
    quotaState.rateLimited = true;

    const r = await authenticateApiKey(req(raw), NOW);

    expect(r).toMatchObject({ ok: false, status: 429 });
    if (!r.ok) expect(r.headers?.['Retry-After']).toBeDefined();
    expect(quotaState.calls.find((c) => c.fn === 'kefy_rate_limit_hit')?.args.p_bucket).toBe(`apikey:${IDS.KEY}`);
  });

  it('503 si la base no responde, y el token nunca llega a Sentry', async () => {
    const { raw } = seedKey();
    db.failNext('kefy_api_keys', 'select');

    const r = await authenticateApiKey(req(raw), NOW);

    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(vi.mocked(reportError).mock.calls)).not.toContain(raw);
  });

  it('actualiza last_used_at como mucho una vez por minuto', async () => {
    const { raw, row } = seedKey({ last_used_at: new Date(NOW.getTime() - 30_000).toISOString() });

    await authenticateApiKey(req(raw), NOW);
    await new Promise((r) => setTimeout(r, 0));
    expect(db.writes('kefy_api_keys')).toHaveLength(0);

    const later = new Date(NOW.getTime() + 60_000);
    await authenticateApiKey(req(raw), later);
    await new Promise((r) => setTimeout(r, 0));
    expect(db.rows('kefy_api_keys').find((k) => k.id === row.id)?.last_used_at).toBe(later.toISOString());
  });
});

describe('apiToolContext', () => {
  it('una key sin marca deja brandId vacío para que el registro lo resuelva', async () => {
    const { raw } = seedKey();
    const r = await authenticateApiKey(req(raw), NOW);
    if (!r.ok) throw new Error('auth');

    const ctx = apiToolContext(r.value, 'mcp', 'es');

    expect(ctx).toMatchObject({
      source: 'mcp', brandId: '', boundBrandId: null, brandScope: 'strict', apiKeyId: IDS.KEY,
      scopes: ['read', 'write'], role: 'owner', language: 'es',
    });
  });

  it('una key atada fija la marca', async () => {
    const { raw } = seedKey({ brand_id: IDS.BRAND_2 });
    const r = await authenticateApiKey(req(raw), NOW);
    if (!r.ok) throw new Error('auth');

    expect(apiToolContext(r.value, 'api')).toMatchObject({ brandId: IDS.BRAND_2, boundBrandId: IDS.BRAND_2, language: 'en' });
  });
});

describe('apiLanguage', () => {
  it('inglés por defecto, español si Accept-Language empieza por es', () => {
    expect(apiLanguage(req())).toBe('en');
    expect(apiLanguage(req(undefined, { 'accept-language': 'es-CL,es;q=0.9' }))).toBe('es');
    expect(apiLanguage(req(undefined, { 'accept-language': 'en-US,es;q=0.5' }))).toBe('en');
  });
});
