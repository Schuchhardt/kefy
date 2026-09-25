// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { IDS, AUTH, seedWorkspace } from '../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

import { GET, POST } from '@/app/api/strategies/custom/route';
import { DELETE, PATCH } from '@/app/api/strategies/custom/[id]/route';
import { PATCH as PATCH_ORG } from '@/app/api/strategies/org/route';
import { getAuthFromRequest } from '@/lib/auth';
import type { JWTPayload } from '@/types/auth';

// Rutas de estrategias propias: solo adaptan HTTP al servicio. Lo que importa
// aquí es el rol (solo owner/admin escriben), el aislamiento entre orgs y que
// `activate` deje la estrategia como la activa.

const OTHER_CUSTOM = IDS.uuid(310);
const URL_BASE = 'http://localhost:3099/api/strategies/custom';
const BODY = {
  name: 'Café de barrio',
  calendar: [{ week: 1, format: 'post', topic: 'Presentamos el blend de otoño' }],
};

function as(auth: JWTPayload | null) {
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
}
const json = (method: string, url: string, body: unknown) =>
  new NextRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db.reset();
  vi.mocked(getAuthFromRequest).mockReset();
  seedWorkspace(db);
  db.seed('kefy_custom_strategies', [{
    id: OTHER_CUSTOM, org_id: IDS.OTHER_ORG, name: 'Ajena', calendar: [], created_via: 'ui', updated_via: 'ui',
  }]);
});

describe('/api/strategies/custom', () => {
  it('sin sesión → 401', async () => {
    as(null);
    expect((await GET(new NextRequest(URL_BASE))).status).toBe(401);
  });

  it('un miembro puede listar pero no crear', async () => {
    as({ ...AUTH, role: 'member' });
    const list = await GET(new NextRequest(URL_BASE));
    expect(list.status).toBe(200);
    expect((await list.json()).strategies).toEqual([]);

    expect((await POST(json('POST', URL_BASE, BODY))).status).toBe(403);
    expect(db.rows('kefy_custom_strategies')).toHaveLength(1);
  });

  it('owner crea con activate → 201 y queda como la activa de la org', async () => {
    as(AUTH);
    const res = await POST(json('POST', URL_BASE, { ...BODY, activate: true }));
    expect(res.status).toBe(201);
    const { strategy, selection } = await res.json();
    expect(strategy).toMatchObject({ org_id: IDS.ORG, name: 'Café de barrio', created_via: 'ui' });
    expect(selection.custom_strategy_id).toBe(strategy.id);
  });

  it('ignora un id en el cuerpo del POST: siempre crea una nueva', async () => {
    as(AUTH);
    const res = await POST(json('POST', URL_BASE, { ...BODY, id: OTHER_CUSTOM }));
    expect(res.status).toBe(201);
    expect(db.find('kefy_custom_strategies', (r) => r.id === OTHER_CUSTOM)?.name).toBe('Ajena');
  });

  it('entrada inválida → 422 con issues, en inglés con ?lang=en', async () => {
    as(AUTH);
    const res = await POST(json('POST', `${URL_BASE}?lang=en`, { name: '' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
    expect(body.issues).toBeDefined();
  });
});

describe('/api/strategies/custom/[id]', () => {
  it('editar o borrar la de otra org → 404 y no la toca', async () => {
    as(AUTH);
    expect((await PATCH(json('PATCH', `${URL_BASE}/${OTHER_CUSTOM}`, { name: 'Robada' }), params(OTHER_CUSTOM))).status).toBe(404);
    expect((await DELETE(new NextRequest(`${URL_BASE}/${OTHER_CUSTOM}`, { method: 'DELETE' }), params(OTHER_CUSTOM))).status).toBe(404);
    expect(db.find('kefy_custom_strategies', (r) => r.id === OTHER_CUSTOM)?.name).toBe('Ajena');
  });

  it('borrar la propia → 204', async () => {
    as(AUTH);
    const { strategy } = await (await POST(json('POST', URL_BASE, BODY))).json();
    const res = await DELETE(new NextRequest(`${URL_BASE}/${strategy.id}`, { method: 'DELETE' }), params(strategy.id));
    expect(res.status).toBe(204);
    expect(db.find('kefy_custom_strategies', (r) => r.id === strategy.id)).toBeUndefined();
  });
});

describe('PATCH /api/strategies/org con custom_strategy_id', () => {
  it('activar la de otra org → 404', async () => {
    as(AUTH);
    const res = await PATCH_ORG(json('PATCH', 'http://localhost:3099/api/strategies/org', { custom_strategy_id: OTHER_CUSTOM }));
    expect(res.status).toBe(404);
    expect(db.rows('kefy_org_strategies')).toHaveLength(0);
  });

  it('null vuelve a la del catálogo', async () => {
    as(AUTH);
    const { strategy } = await (await POST(json('POST', URL_BASE, { ...BODY, activate: true }))).json();
    expect(db.find('kefy_org_strategies', (r) => r.org_id === IDS.ORG)?.custom_strategy_id).toBe(strategy.id);

    const res = await PATCH_ORG(json('PATCH', 'http://localhost:3099/api/strategies/org', { custom_strategy_id: null }));
    expect(res.status).toBe(200);
    expect((await res.json()).selection.custom_strategy_id).toBeNull();
  });
});
