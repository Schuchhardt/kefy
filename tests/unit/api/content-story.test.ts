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
  generateContentText: vi.fn(),
  generateContentImage: vi.fn(),
  generateReelScript: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateContentText, generateContentImage, generateReelScript } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

const mockAuth  = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };
const mockBrand = { id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca', avatar_url: null, archived: false, created_at: '', updated_at: '' };

function makeReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost:3097/api/content/story', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockBrandKitChain(data: unknown = { id: 'kit-1', name: 'Marca', tagline: null, tone: [], industry: null, primary_color: null, secondary_color: null, accent_color: null, logo_url: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

// ─── POST /api/content/story ───────────────────────────────────────────────────

describe('POST /api/content/story', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq('POST', { topic: 'Lanzamiento' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 422 si falta topic', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', { channel: 'instagram' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 422 con channel inválido', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', { channel: 'mytube', topic: 'Lanzamiento' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 502 si la generación de texto falla', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateContentText).mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq('POST', { topic: 'Lanzamiento' }));
    expect(res.status).toBe(502);
  });

  it('con save:false devuelve el contenido generado sin persistir', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });
    mockSupabaseClient.from.mockReturnValueOnce(mockBrandKitChain());
    vi.mocked(generateContentText).mockResolvedValueOnce({
      body: 'Texto de la story', hashtags: ['#a'], model: 'claude-opus-4-5', tokensUsed: 10,
    });
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/story.jpg');

    const res = await POST(makeReq('POST', { topic: 'Lanzamiento', save: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBeUndefined();
    expect(body.image_url).toBe('https://cdn.example.com/story.jpg');
    // No debe haber llamado a insert (solo la lectura del brand kit)
    expect(mockSupabaseClient.from).toHaveBeenCalledTimes(1);
  });

  it('persiste el item con content_type=story y devuelve 201', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'story-item-1', content_type: 'story', channel: 'instagram', status: 'draft', created_at: '2026-07-13T00:00:00Z' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateContentText).mockResolvedValueOnce({
      body: 'Texto de la story', hashtags: ['#lanzamiento'], model: 'claude-opus-4-5', tokensUsed: 12,
    });
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/story.jpg');

    const res = await POST(makeReq('POST', { channel: 'instagram', topic: 'Lanzamiento de producto' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.itemId).toBe('story-item-1');

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.content_type).toBe('story');
    expect(insertedRow.image_url).toBe('https://cdn.example.com/story.jpg');
  });

  it('si la generación de imagen falla, igual persiste con image_url null', async () => {
    const { POST } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'story-item-2' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(insertChain);

    vi.mocked(generateContentText).mockResolvedValueOnce({
      body: 'Texto', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 5,
    });
    vi.mocked(generateContentImage).mockRejectedValueOnce(new Error('image gen failed'));

    const res = await POST(makeReq('POST', { topic: 'Lanzamiento' }));
    expect(res.status).toBe(201);
    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.image_url).toBeNull();
  });
});

// ─── PATCH /api/content/story ──────────────────────────────────────────────────

describe('PATCH /api/content/story', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { PATCH } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await PATCH(makeReq('PATCH', { itemId: 'story-1' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 422 si falta itemId', async () => {
    const { PATCH } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const res = await PATCH(makeReq('PATCH', {}));
    expect(res.status).toBe(422);
  });

  it('devuelve 404 si el item no existe', async () => {
    const { PATCH } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const itemChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    mockSupabaseClient.from.mockReturnValueOnce(itemChain);

    const res = await PATCH(makeReq('PATCH', { itemId: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('devuelve 422 si el item no es content_type=story', async () => {
    const { PATCH } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const itemChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'post-1', content_type: 'post', channel: 'instagram', body: 'x', title: null }, error: null }),
    };
    mockSupabaseClient.from.mockReturnValueOnce(itemChain);

    const res = await PATCH(makeReq('PATCH', { itemId: 'post-1' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/story/i);
  });

  it('genera el guion de video y guarda las escenas en slides', async () => {
    const { PATCH } = await import('@/app/api/content/story/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const itemChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'story-1', content_type: 'story', channel: 'instagram', body: 'Texto de la story', title: null },
        error: null,
      }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(itemChain)
      .mockReturnValueOnce(mockBrandKitChain())
      .mockReturnValueOnce(updateChain);

    vi.mocked(generateReelScript).mockResolvedValueOnce({
      scenes: [
        { scene_order: 1, title: 'Escena 1', body: 'Hola', duration_seconds: 3, image_prompt: 'prompt 1' },
        { scene_order: 2, title: 'Escena 2', body: 'Chau', duration_seconds: 3, image_prompt: 'prompt 2' },
      ],
      hook: 'Hook', hashtags: [], model: 'claude-opus-4-5', tokensUsed: 20,
    });
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'ZmFrZQ==', revisedPrompt: 'x' });
    vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/scene.jpg');

    const res = await PATCH(makeReq('PATCH', { itemId: 'story-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenes).toHaveLength(2);

    const updatePayload = updateChain.update.mock.calls[0][0] as Record<string, unknown>;
    const savedScenes = updatePayload.slides as Array<Record<string, unknown>>;
    expect(savedScenes).toHaveLength(2);
    expect(savedScenes[0].image_url).toBe('https://cdn.example.com/scene.jpg');
  });
});
