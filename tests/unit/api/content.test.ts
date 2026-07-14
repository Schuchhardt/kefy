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
    const dbChain = {
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

// ─── POST /api/content ────────────────────────────────────────────────────────

describe('POST /api/content', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq('POST', undefined, { channel: 'linkedin', body: 'Hola' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 404 sin brand', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: null });

    const res = await POST(makeReq('POST', undefined, { channel: 'linkedin', body: 'Hola' }));
    expect(res.status).toBe(404);
  });

  it('devuelve 400 con body inválido (no JSON)', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const req = new NextRequest('http://localhost:3097/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('devuelve 422 con channel inválido o ausente', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', undefined, { channel: 'mytube', body: 'Hola' }));
    expect(res.status).toBe(422);
  });

  it('devuelve 422 si carousel/reel no traen slides', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const res = await POST(makeReq('POST', undefined, {
      channel: 'instagram', content_type: 'carousel', body: 'Hola',
    }));
    expect(res.status).toBe(422);
    const resBody = await res.json();
    expect(resBody.error).toMatch(/slides/);
  });

  it('crea un post simple (content_type default) y devuelve 201', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandKitChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const newItem = { id: 'item-1', content_type: 'post', channel: 'linkedin' };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newItem, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(brandKitChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeReq('POST', undefined, {
      channel: 'linkedin', body: 'Hola mundo',
    }));
    expect(res.status).toBe(201);
    const resBody = await res.json();
    expect(resBody.item.id).toBe('item-1');

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.content_type).toBe('post');
    expect(insertedRow.video_url).toBeNull();
  });

  it('crea un story con video_url y content_type=story', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandKitChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const newItem = { id: 'item-story-1', content_type: 'story', channel: 'instagram' };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newItem, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(brandKitChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeReq('POST', undefined, {
      channel: 'instagram', content_type: 'story', body: 'Mi story', video_url: 'https://cdn.example.com/story.mp4',
    }));
    expect(res.status).toBe(201);

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.content_type).toBe('story');
    expect(insertedRow.video_url).toBe('https://cdn.example.com/story.mp4');
  });

  it('ignora video_url si content_type es post (no reel/story)', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandKitChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'kit-1' }, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'item-2' }, error: null }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(brandKitChain)
      .mockReturnValueOnce(insertChain);

    await POST(makeReq('POST', undefined, {
      channel: 'linkedin', content_type: 'post', body: 'Hola', video_url: 'https://cdn.example.com/should-be-ignored.mp4',
    }));

    const insertedRow = insertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedRow.video_url).toBeNull();
  });

  it('devuelve 500 si el insert falla', async () => {
    const { POST } = await import('@/app/api/content/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    vi.mocked(getBrandFromRequest).mockResolvedValueOnce({ brand: mockBrand });

    const brandKitChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    };
    mockSupabaseClient.from
      .mockReturnValueOnce(brandKitChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(makeReq('POST', undefined, { channel: 'linkedin', body: 'Hola' }));
    expect(res.status).toBe(500);
  });
});
