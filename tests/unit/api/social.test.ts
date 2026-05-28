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

vi.mock('@/lib/zernio', () => ({
  listAccounts: vi.fn(),
  connectAccount: vi.fn(),
  createProfile: vi.fn(),
  disconnectAccount: vi.fn(),
  ZernioError: class ZernioError extends Error {
    statusCode: number;
    constructor(msg: string, code: number) { super(msg); this.statusCode = code; }
  },
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

function makeReq(method = 'GET', body?: unknown, url = 'http://localhost:3097/api/social/accounts') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── GET /api/social/accounts ─────────────────────────────────────────────────

describe('GET /api/social/accounts', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { GET } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('devuelve 404 sin brand', async () => {
    const { GET } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: null });

    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('devuelve 200 con lista de cuentas', async () => {
    const { GET } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const accounts = [{ id: 'sa-1', platform: 'instagram', username: '@test' }];
    const dbChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: accounts, error: null }),
    };
    mockSupabaseClient.from.mockReturnValue(dbChain);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toHaveLength(1);
  });
});

// ─── POST /api/social/accounts ────────────────────────────────────────────────

describe('POST /api/social/accounts', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq('POST', { platform: 'instagram', code: 'abc', redirect_uri: 'https://app.kefy.com/callback' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol member', async () => {
    const { POST } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce({ ...mockAuth, role: 'member' } as never);

    const res = await POST(makeReq('POST', { platform: 'instagram', code: 'abc', redirect_uri: 'https://app.kefy.com/callback' }));
    expect(res.status).toBe(403);
  });

  it('devuelve 422 para plataforma inválida', async () => {
    const { POST } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', { platform: 'mytube', code: 'abc', redirect_uri: 'https://app.kefy.com/callback' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 422 si falta el código OAuth', async () => {
    const { POST } = await import('@/app/api/social/accounts/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', { platform: 'instagram', code: '', redirect_uri: 'https://app.kefy.com/callback' }));
    expect(res.status).toBe(422);
  });
});
