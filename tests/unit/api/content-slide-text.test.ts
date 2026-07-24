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

vi.mock('@/lib/ai', () => ({
  generateSlideText: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { generateSlideText } from '@/lib/ai';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

function makeReq(body?: unknown) {
  return new NextRequest('http://localhost:3097/api/content/slide-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockBrandKitChain(data: unknown = { name: 'Marca', tagline: null, tone: [] }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

const okResult = { title: 'Nuevo título', body: 'Nuevo cuerpo', model: 'claude-opus-4-5', tokensUsed: 12 };

describe('POST /api/content/slide-text', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq({ title: 'x' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 400 con body no-JSON', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const req = new NextRequest('http://localhost:3097/api/content/slide-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'no-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('devuelve el título y cuerpo regenerados (200)', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateSlideText).mockResolvedValueOnce(okResult);

    const res = await POST(makeReq({ channel: 'instagram', title: 'Viejo', body: 'Texto', feedback: 'más corto' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ title: 'Nuevo título', body: 'Nuevo cuerpo' });
  });

  it('pasa el channel válido y el kind a la función de IA', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateSlideText).mockResolvedValueOnce(okResult);

    await POST(makeReq({ channel: 'linkedin', kind: 'reel', title: 'T', body: 'B' }));

    const args = vi.mocked(generateSlideText).mock.calls[0][0];
    expect(args.channel).toBe('linkedin');
    expect(args.kind).toBe('reel');
  });

  it('usa channel "generic" cuando el channel no es de copy (p. ej. youtube)', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateSlideText).mockResolvedValueOnce(okResult);

    const res = await POST(makeReq({ channel: 'youtube', title: 'T' }));
    expect(res.status).toBe(200);
    const args = vi.mocked(generateSlideText).mock.calls[0][0];
    expect(args.channel).toBe('generic');
  });

  it('kind por defecto es "carousel" cuando no se envía', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateSlideText).mockResolvedValueOnce(okResult);

    await POST(makeReq({ title: 'T' }));

    const args = vi.mocked(generateSlideText).mock.calls[0][0];
    expect(args.kind).toBe('carousel');
  });

  it('devuelve 502 si la generación falla', async () => {
    const { POST } = await import('@/app/api/content/slide-text/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateSlideText).mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq({ title: 'T' }));
    expect(res.status).toBe(502);
  });
});
