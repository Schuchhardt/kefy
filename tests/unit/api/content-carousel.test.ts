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

vi.mock('@/lib/ai', () => ({
  generateCarouselSlides: vi.fn(),
  generateContentImage: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn(),
}));

vi.mock('@/lib/image-processor', () => ({
  compositeTextOnImage: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateCarouselSlides, generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';
import { compositeTextOnImage } from '@/lib/image-processor';

const mockAuth  = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

function makeReq(body?: unknown) {
  return new NextRequest('http://localhost:3097/api/content/carousel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockBrandKitChain(data: unknown = { id: 'kit-1', name: 'Marca', tagline: null, tone: [], industry: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function makeSlides(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    slide_order: i + 1,
    title: `Slide ${i + 1}`,
    body: `Body ${i + 1}`,
    image_prompt: `prompt ${i + 1}`,
  }));
}

describe('POST /api/content/carousel', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq({ topic: 'Producto' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 422 si falta topic', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq({ channel: 'instagram' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 422 con channel inválido', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq({ channel: 'mytube', topic: 'Producto' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 502 si la generación de slides falla', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateCarouselSlides).mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq({ topic: 'Producto' }));
    expect(res.status).toBe(502);
  });

  it('clampea slide_count a un máximo de 10', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(10), description: 'desc', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    await POST(makeReq({ topic: 'Producto', slide_count: 20, generate_images: false, save: false }));

    const callArgs = vi.mocked(generateCarouselSlides).mock.calls[0][0];
    expect(callArgs.slide_count).toBe(10);
  });

  it('clampea slide_count a un mínimo de 3', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(3), description: 'desc', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    await POST(makeReq({ topic: 'Producto', slide_count: 1, generate_images: false, save: false }));

    const callArgs = vi.mocked(generateCarouselSlides).mock.calls[0][0];
    expect(callArgs.slide_count).toBe(3);
  });

  it('generate_images:false no genera imágenes por slide', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(3), description: 'desc', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });

    const res = await POST(makeReq({ topic: 'Producto', generate_images: false, save: false }));
    expect(res.status).toBe(200);
    expect(generateContentImage).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.slides.every((s: { image_url: unknown }) => s.image_url === null)).toBe(true);
  });

  it('con save:false devuelve slides sin persistir', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(3), description: 'desc', hashtags: ['#x'], model: 'claude-opus-4-5', tokensUsed: 1,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(compositeTextOnImage).mockResolvedValue('ZmFrZQ==');
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/slide.jpg');

    const res = await POST(makeReq({ topic: 'Producto', save: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBeUndefined();
    // Solo debe haber consultado el brand kit, sin insertar
    expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1);
  });

  it('persiste el item con content_type=carousel y devuelve 201', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'carousel-1', content_type: 'carousel', channel: 'instagram', status: 'draft', created_at: '2026-07-13T00:00:00Z' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(4), description: 'desc', hashtags: ['#producto'], model: 'claude-opus-4-5', tokensUsed: 30,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(compositeTextOnImage).mockResolvedValue('ZmFrZQ==');
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/slide.jpg');

    const res = await POST(makeReq({ channel: 'instagram', topic: 'Producto nuevo' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.itemId).toBe('carousel-1');

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.content_type).toBe('carousel');
    expect((insertedRow.slides as unknown[]).length).toBe(4);
    expect(insertedRow.image_url).toBe('https://cdn.example.com/slide.jpg');
  });

  it('devuelve 500 si el insert falla', async () => {
    const { POST } = await import('@/app/api/content/carousel/route');
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

    vi.mocked(generateCarouselSlides).mockResolvedValueOnce({
      slides: makeSlides(3), description: 'desc', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 1,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(compositeTextOnImage).mockResolvedValue('ZmFrZQ==');
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/slide.jpg');

    const res = await POST(makeReq({ topic: 'Producto' }));
    expect(res.status).toBe(500);
  });
});
