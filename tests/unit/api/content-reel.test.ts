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
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/brands', () => ({
  getBrandFromRequest: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  generateReelScript: vi.fn(),
  generateContentImage: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateReelScript, generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

const mockAuth  = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

function makeReq(body?: unknown) {
  return new NextRequest('http://localhost:3097/api/content/reel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockBrandKitChain(data: unknown = { id: 'kit-1', name: 'Marca', tagline: null, tone: [], industry: null, primary_color: null, secondary_color: null, accent_color: null, font_heading: null, logo_url: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function makeScenes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    scene_order: i + 1,
    title: `Escena ${i + 1}`,
    body: `Cuerpo ${i + 1}`,
    duration_seconds: 3,
    image_prompt: `prompt ${i + 1}`,
  }));
}

describe('POST /api/content/reel', () => {
  beforeEach(() => { vi.resetAllMocks(); resetQuotaState(); resetSubscriptionState(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq({ topic: 'Tutorial' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 422 si falta topic', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq({ channel: 'instagram' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 422 con channel inválido', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq({ channel: 'mytube', topic: 'Tutorial' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 502 si la generación del guion falla', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateReelScript).mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq({ topic: 'Tutorial' }));
    expect(res.status).toBe(502);
  });

  it('clampea scene_count a un máximo de 8', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(8), hook: 'Hook', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    await POST(makeReq({ topic: 'Tutorial', scene_count: 20, generate_images: false, save: false }));

    const callArgs = vi.mocked(generateReelScript).mock.calls[0][0];
    expect(callArgs.scene_count).toBe(8);
  });

  it('clampea scene_count a un mínimo de 3', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(3), hook: 'Hook', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    await POST(makeReq({ topic: 'Tutorial', scene_count: 1, generate_images: false, save: false }));

    const callArgs = vi.mocked(generateReelScript).mock.calls[0][0];
    expect(callArgs.scene_count).toBe(3);
  });

  it('generate_images:false no genera imágenes por escena', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'reel-1' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(3), hook: 'Hook', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    const res = await POST(makeReq({ topic: 'Tutorial', generate_images: false }));
    expect(res.status).toBe(201);
    expect(generateContentImage).not.toHaveBeenCalled();
  });

  it('save:false ya no evita persistir — un reel siempre queda en la biblioteca', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'reel-1' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(3), hook: 'Hook', hashtags: ['#x'], model: 'claude-opus-4-5', tokensUsed: 1,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/scene.jpg');

    const res = await POST(makeReq({ topic: 'Tutorial', save: false }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.itemId).toBe('reel-1');
    expect(insertChain.insert).toHaveBeenCalledTimes(1);
  });

  it('devuelve 422 con variant_count fuera de rango', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq({ topic: 'Tutorial', variant_count: 4 }));
    expect(res.status).toBe(422);
  });

  it('variant_count:2 genera y persiste dos variantes agrupadas', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChainFor = (id: string) => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
    });
    const insertChainA = insertChainFor('reel-a');
    const insertChainB = insertChainFor('reel-b');
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChainA)
      .mockReturnValueOnce(insertChainB);

    vi.mocked(generateReelScript)
      .mockResolvedValueOnce({ scenes: makeScenes(3), hook: 'Hook A', hashtags: ['#a'], model: 'claude-opus-4-5', tokensUsed: 1 })
      .mockResolvedValueOnce({ scenes: makeScenes(3), hook: 'Hook B', hashtags: ['#b'], model: 'claude-opus-4-5', tokensUsed: 1 });

    const res = await POST(makeReq({ topic: 'Tutorial', generate_images: false, variant_count: 2 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.variants).toHaveLength(2);
    expect(body.requested_variant_count).toBe(2);
    expect(body.variant_group_id).toBeTruthy();
    expect(body.variants[0].itemId).toBe('reel-a');
    expect(body.variants[1].itemId).toBe('reel-b');

    const rowA = insertChainA.insert.mock.calls[0][0] as Record<string, unknown>;
    const rowB = insertChainB.insert.mock.calls[0][0] as Record<string, unknown>;
    const metaA = rowA.metadata as Record<string, unknown>;
    const metaB = rowB.metadata as Record<string, unknown>;
    expect(metaA.variant_group_id).toBe(metaB.variant_group_id);
    expect(metaA.variant_index).toBe(1);
    expect(metaB.variant_index).toBe(2);
  });

  it('con variant_count:2, si la segunda variante falla se queda con la primera en vez de fallar todo', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'reel-a' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateReelScript)
      .mockResolvedValueOnce({ scenes: makeScenes(3), hook: 'Hook A', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1 })
      .mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq({ topic: 'Tutorial', generate_images: false, variant_count: 2 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requested_variant_count).toBe(2);
    expect(body.variants).toHaveLength(1);
    expect(body.variants[0].itemId).toBe('reel-a');
  });

  it('persiste el item con content_type=reel y devuelve 201', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'reel-1', content_type: 'reel', channel: 'instagram', status: 'draft', created_at: '2026-07-13T00:00:00Z' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(5), hook: 'Hook llamativo', hashtags: ['#tutorial'], model: 'claude-opus-4-5', tokensUsed: 40,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/scene.jpg');

    const res = await POST(makeReq({ channel: 'instagram', topic: 'Tutorial de producto' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.itemId).toBe('reel-1');

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.content_type).toBe('reel');
    expect((insertedRow.slides as unknown[]).length).toBe(5);
    expect(insertedRow.image_url).toBe('https://cdn.example.com/scene.jpg');
    expect(insertedRow.title).toBe('Hook llamativo');
  });

  it('devuelve 500 si el insert falla', async () => {
    const { POST } = await import('@/app/api/content/reel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: makeScenes(3), hook: 'Hook', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/scene.jpg');

    const res = await POST(makeReq({ topic: 'Tutorial' }));
    expect(res.status).toBe(500);
  });
});
