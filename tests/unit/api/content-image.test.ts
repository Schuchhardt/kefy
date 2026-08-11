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
  generateContentImage: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn(),
}));

vi.mock('@/lib/image-processor', () => ({
  compositeTextOnImage: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { generateContentImage } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

function makeReq(body?: unknown) {
  return new NextRequest('http://localhost:3097/api/content/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Chainable stub for `kefy_content_items`, recording every `.update()` patch
 *  so the test can assert the image_status transitions. */
function makeItemsChain() {
  const updates: Record<string, unknown>[] = [];
  const chain = {
    updates,
    update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return chain; }),
    eq: vi.fn(() => chain),
  };
  return chain;
}

function mockDb(itemsChain: ReturnType<typeof makeItemsChain>) {
  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'kefy_content_items') return itemsChain;
    // brand kit lookup
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

describe('POST /api/content/image', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(makeReq({ prompt: 'un gato' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 422 si falta prompt', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const res = await POST(makeReq({ size: '1024x1024' }));
    expect(res.status).toBe(422);
  });

  // Contrato consumido por la página de creación y por EditContentModal: la URL
  // viaja anidada en `image.url`, NO en `url` a nivel raíz. Leerla del lugar
  // equivocado deja la imagen sin aparecer hasta recargar la página.
  it('devuelve la URL en image.url (no en la raíz)', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockDb(makeItemsChain());
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: 'un gato naranja' } as never);
    vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/generated.jpeg');

    const res  = await POST(makeReq({ prompt: 'un gato' }));
    const body = await res.json() as Record<string, unknown> & { image?: { url?: string } };

    expect(res.status).toBe(201);
    expect(body.image?.url).toBe('https://cdn.example.com/generated.jpeg');
    expect(body.url).toBeUndefined();
  });

  it('con itemId: marca generating al entrar y ready con la URL al terminar', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const items = makeItemsChain();
    mockDb(items);
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
    vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/generated.jpeg');

    const res = await POST(makeReq({ prompt: 'un gato', itemId: 'item-1' }));

    expect(res.status).toBe(201);
    expect(items.updates[0]).toEqual({ image_status: 'generating' });
    expect(items.updates[1]).toMatchObject({
      image_url: 'https://cdn.example.com/generated.jpeg',
      image_status: 'ready',
    });
  });

  // Sin esto el item queda en 'generating' para siempre y su tarjeta se queda
  // cargando sin salida.
  it('con itemId: marca error si la generación falla', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const items = makeItemsChain();
    mockDb(items);
    vi.mocked(generateContentImage).mockRejectedValueOnce(new Error('AI down'));

    const res = await POST(makeReq({ prompt: 'un gato', itemId: 'item-1' }));

    expect(res.status).toBe(502);
    expect(items.updates[0]).toEqual({ image_status: 'generating' });
    expect(items.updates[1]).toEqual({ image_status: 'error' });
  });

  it('con itemId: marca error si falla la subida a storage', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const items = makeItemsChain();
    mockDb(items);
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
    vi.mocked(uploadBase64Image).mockRejectedValueOnce(new Error('storage down'));

    const res = await POST(makeReq({ prompt: 'un gato', itemId: 'item-1' }));

    expect(res.status).toBe(500);
    expect(items.updates[1]).toEqual({ image_status: 'error' });
  });
});
