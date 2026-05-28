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
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/brands', () => ({
  getBrandFromRequest: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

function makeReq(method = 'GET', params?: Record<string, string>, body?: unknown) {
  const url = new URL('http://localhost:3097/api/content');
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── GET /api/content ─────────────────────────────────────────────────────────

describe('GET /api/content', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { GET } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('devuelve 404 sin brand', async () => {
    const { GET } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: null });

    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('devuelve 200 con lista de items', async () => {
    const { GET } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const items = [{ id: 'c1', channel: 'linkedin', status: 'draft' }];
    const dbChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: items, error: null, count: 1 }),
    };
    mockSupabaseClient.from.mockReturnValue(dbChain);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it('aplica filtro de channel válido', async () => {
    const { GET } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    // El route llama .range() y DESPUÉS .eq() sobre el resultado,
    // así que todos los métodos deben retornar `this` y el objeto debe ser thenable.
    const resolved = { data: [] as unknown[], error: null, count: 0 };
    const dbChain: ReturnType<typeof vi.fn> & Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: (resolve: (v: typeof resolved) => unknown) =>
        Promise.resolve(resolved).then(resolve),
    };
    mockSupabaseClient.from.mockReturnValue(dbChain);

    await GET(makeReq('GET', { channel: 'linkedin' }));
    // El método eq debe haberse llamado con 'channel'
    const eqCalls = (dbChain.eq as ReturnType<typeof vi.fn>).mock.calls as Array<[string, string]>;
    const channelFilter = eqCalls.find(([field]) => field === 'channel');
    expect(channelFilter).toBeTruthy();
    expect(channelFilter![1]).toBe('linkedin');
  });

  it('ignora channel inválido (no aplica filtro)', async () => {
    const { GET } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const dbChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    };
    mockSupabaseClient.from.mockReturnValue(dbChain);

    await GET(makeReq('GET', { channel: 'mytube' }));
    const eqCalls = (dbChain.eq.mock.calls as Array<[string, string]>);
    const channelFilter = eqCalls.find(([field]) => field === 'channel');
    expect(channelFilter).toBeUndefined();
  });
});
