import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeRpc, resetQuotaState, resetSubscriptionState } from '../helpers/quota';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
  rpc: fakeRpc,
};

// `guardAiRequest` y `requireActiveSubscription` consultan la suscripción antes
// de gastar nada. Se controla desde `subscriptionState` (helpers/quota).
vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/subscription')>();
  const { fakeEntitlement } = await import('../helpers/quota');
  return {
    ...actual,
    getEntitlement: async () => fakeEntitlement(),
    requireActiveSubscription: async (_orgId: string, language: 'es' | 'en' = 'es') => {
      const e = fakeEntitlement();
      if (e.canCreate) return null;
      const reason = e.reason ?? 'canceled';
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        { error: actual.blockMessage(reason, language), subscriptionRequired: true, reason, status: e.status },
        { status: 402 },
      );
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  createSupabaseServer: () => mockSupabaseClient,
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getAuthFromRequest: vi.fn(),
  };
});

vi.mock('@/lib/brands', () => ({
  getBrandFromRequest: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method = 'GET', body?: unknown, url = 'http://localhost:3097/api/brand-kit') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Mi Marca', slug: 'mi-marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

// ─── GET /api/brand-kit ───────────────────────────────────────────────────────

describe('GET /api/brand-kit', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('devuelve 401 si no hay autenticación', async () => {
    const { GET } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('devuelve 404 si no hay brand', async () => {
    const { GET } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it('devuelve 200 con el kit cuando existe', async () => {
    const { GET } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const mockKit = { id: 'kit-1', brand_id: 'brand-1', name: 'Mi Marca' };
    const dbChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockKit, error: null }),
    };
    mockSupabaseClient.from.mockReturnValue(dbChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kit.id).toBe('kit-1');
  });

  it('crea y devuelve 201 si el kit no existe', async () => {
    const { GET } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const newKit = { id: 'kit-new', brand_id: 'brand-1', name: 'Mi Marca' };
    // Primera llamada: maybeSingle devuelve null (no kit)
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    // Segunda llamada: insert devuelve newKit
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newKit, error: null }),
    };

    mockSupabaseClient.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain);

    const res = await GET(makeRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kit.id).toBe('kit-new');
  });
});

// ─── PATCH /api/brand-kit ─────────────────────────────────────────────────────

describe('PATCH /api/brand-kit', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('devuelve 401 si no hay autenticación', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest('PATCH', { name: 'Nuevo' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol member', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce({ ...mockAuth, role: 'member' } as never);

    const res = await PATCH(makeRequest('PATCH', { name: 'Nuevo' }));
    expect(res.status).toBe(403);
  });

  it('devuelve 422 para color hex inválido', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await PATCH(makeRequest('PATCH', { primary_color: 'rojo' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 200 con actualización válida', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    // Cambiar `name` siempre sincroniza kefy_brands.name (ver lib/services/
    // brand-kit.ts) — el resultado se usa vía `await`, no `.single()`, así que
    // la cadena tiene que ser thenable.
    const brandSyncChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    const existsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'kit-1', name: 'Nuevo Nombre' }, error: null }),
    };

    mockSupabaseClient.from
      .mockReturnValueOnce(brandSyncChain)
      .mockReturnValueOnce(existsChain)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(makeRequest('PATCH', { name: 'Nuevo Nombre' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kit.name).toBe('Nuevo Nombre');
  });

  it('con ?syncOrg=1 y una sola marca en la org, también renombra la organización', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandSyncChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    const brandCountChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { count: number; error: null }) => unknown) =>
        Promise.resolve({ count: 1, error: null }).then(resolve),
    };
    const orgUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    const existsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'kit-1', name: 'Solo Marca' }, error: null }),
    };

    mockSupabaseClient.from
      .mockReturnValueOnce(brandSyncChain)
      .mockReturnValueOnce(brandCountChain)
      .mockReturnValueOnce(orgUpdateChain)
      .mockReturnValueOnce(existsChain)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(
      makeRequest('PATCH', { name: 'Solo Marca' }, 'http://localhost:3097/api/brand-kit?syncOrg=1'),
    );
    expect(res.status).toBe(200);
    expect(orgUpdateChain.update).toHaveBeenCalledWith({ name: 'Solo Marca' });
  });

  it('con ?syncOrg=1 pero varias marcas en la org, NO renombra la organización', async () => {
    const { PATCH } = await import('@/app/api/brand-kit/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandSyncChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    // Dos marcas activas en la org: el rename de la organización debe saltarse.
    const brandCountChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { count: number; error: null }) => unknown) =>
        Promise.resolve({ count: 2, error: null }).then(resolve),
    };
    const existsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'kit-1', name: 'Segunda Marca' }, error: null }),
    };

    // Nota: no se encola un chain para `kefy_organizations` — si el código
    // intentara renombrar la org de todos modos, `mockSupabaseClient.from`
    // devolvería `undefined` en esa llamada y el `.update` fallaría, haciendo
    // fallar el test.
    mockSupabaseClient.from
      .mockReturnValueOnce(brandSyncChain)
      .mockReturnValueOnce(brandCountChain)
      .mockReturnValueOnce(existsChain)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(
      makeRequest('PATCH', { name: 'Segunda Marca' }, 'http://localhost:3097/api/brand-kit?syncOrg=1'),
    );
    expect(res.status).toBe(200);
  });
});
