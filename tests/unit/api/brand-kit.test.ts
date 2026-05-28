import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
};

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
      .mockReturnValueOnce(existsChain)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(makeRequest('PATCH', { name: 'Nuevo Nombre' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kit.name).toBe('Nuevo Nombre');
  });
});
