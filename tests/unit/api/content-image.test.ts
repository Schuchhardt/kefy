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

vi.mock('@/lib/ai', () => ({
  generateContentImage: vi.fn(),
  generateInfographicCopy: vi.fn(),
  generateSlideText: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn(),
}));

vi.mock('@/lib/image-processor', () => ({
  compositeTextOnImage: vi.fn(),
}));

import { getAuthFromRequest } from '@/lib/auth';
import { generateContentImage, generateInfographicCopy, generateSlideText } from '@/lib/ai';
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

/** Como makeItemsChain, pero el contenido se puede leer: lo pide la infografía. */
function makeReadableItemsChain(row: Record<string, unknown>) {
  const chain = Object.assign(makeItemsChain(), {
    select: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  });
  return chain;
}

const COPY = { headline: 'Fideliza', points: [{ label: 'Escucha', detail: '' }], closing: '', visual: 'steps' };

describe('POST /api/content/image', () => {
  beforeEach(() => { vi.resetAllMocks(); resetQuotaState(); resetSubscriptionState(); });

  describe('image_text', () => {
    const ITEM = '11111111-1111-4111-8111-111111111111';

    it('imprime el texto escrito aparte, en calidad alta y sin forma recortable, y lo recuerda', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      const items = makeReadableItemsChain({ content_type: 'post', metadata: { created_via: 'ui' } });
      mockDb(items as never);
      vi.mocked(generateInfographicCopy).mockResolvedValueOnce(COPY);
      vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
      vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/info.jpeg');

      const res = await POST(makeReq({
        prompt: 'Cómo fidelizar', itemId: ITEM, image_text: 'generated', language: 'en', quality: 'medium', size: '1024x1792',
      }));

      expect(res.status).toBe(201);
      expect(vi.mocked(generateInfographicCopy).mock.calls[0][0]).toMatchObject({ source: 'Cómo fidelizar', language: 'en' });
      const [image] = vi.mocked(generateContentImage).mock.calls[0];
      expect(image).toMatchObject({ style: 'infographic', quality: 'high', size: '1024x1280' });
      expect(image.prompt).toContain('Headline: "Fideliza"');
      expect(items.updates.at(-1)).toMatchObject({
        image_status: 'ready',
        metadata: { created_via: 'ui', image_text: 'generated' },
      });
    });

    it('en una story generada genera para la zona que su interfaz no tapa', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      mockDb(makeReadableItemsChain({ content_type: 'story', metadata: {} }) as never);
      vi.mocked(generateInfographicCopy).mockResolvedValueOnce(COPY);
      vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
      vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/info.jpeg');

      const res = await POST(makeReq({ prompt: 'x', itemId: ITEM, image_text: 'generated' }));

      expect(res.status).toBe(201);
      expect(vi.mocked(generateInfographicCopy).mock.calls[0][0].format).toBe('story');
      expect(vi.mocked(generateContentImage).mock.calls[0][0]).toMatchObject({ format: 'story', size: '1024x1280' });
    });

    it('rechaza un carrusel sin cobrar ni llamar a la IA: quedaría texto sobre texto', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      mockDb(makeReadableItemsChain({ content_type: 'carousel' }) as never);

      const res = await POST(makeReq({ prompt: 'x', itemId: ITEM, image_text: 'generated' }));

      expect(res.status).toBe(422);
      expect(generateInfographicCopy).not.toHaveBeenCalled();
      expect(generateContentImage).not.toHaveBeenCalled();
    });

    it('overlay en un post: foto limpia, y el texto lo escribe la IA si nadie lo escribió', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      const items = makeReadableItemsChain({ content_type: 'post', metadata: {} });
      mockDb(items as never);
      vi.mocked(generateSlideText).mockResolvedValueOnce({ title: 'Hola', body: 'Mundo' } as never);
      vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
      vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/x.jpeg');

      const res = await POST(makeReq({ prompt: 'x', itemId: ITEM, image_text: 'overlay' }));
      const body = await res.json() as { image: { overlay: unknown } };

      expect(vi.mocked(generateContentImage).mock.calls[0][0].style).toBeUndefined();
      expect(body.image.overlay).toEqual({ title: 'Hola', body: 'Mundo' });
      expect(items.updates.at(-1)).toMatchObject({
        metadata: { image_text: 'overlay', image_overlay: { title: 'Hola', body: 'Mundo' } },
      });
    });

    it('overlay: regenerar no reescribe el texto que la persona ya editó', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      const items = makeReadableItemsChain({
        content_type: 'post', metadata: { image_overlay: { title: 'Mío', body: '' } },
      });
      mockDb(items as never);
      vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
      vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/x.jpeg');

      await POST(makeReq({ prompt: 'x', itemId: ITEM, image_text: 'overlay' }));

      expect(generateSlideText).not.toHaveBeenCalled();
      expect(items.updates.at(-1)).toMatchObject({ metadata: { image_overlay: { title: 'Mío', body: '' } } });
    });

    it('si falla la redacción, responde error y marca la imagen sin generarla', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
      const items = makeReadableItemsChain({ content_type: 'post' });
      mockDb(items as never);
      vi.mocked(generateInfographicCopy).mockRejectedValueOnce(new Error('AI down'));

      const res = await POST(makeReq({ prompt: 'x', itemId: ITEM, image_text: 'generated' }));

      expect(res.status).toBe(502);
      expect(generateContentImage).not.toHaveBeenCalled();
      expect(items.updates.at(-1)).toMatchObject({ image_status: 'error' });
    });

    it('rechaza un modo desconocido', async () => {
      const { POST } = await import('@/app/api/content/image/route');
      vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

      const res = await POST(makeReq({ prompt: 'x', image_text: 'collage' }));
      expect(res.status).toBe(422);
    });
  });

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

  // La página de creación ofrece como referencia imágenes de posts anteriores y
  // de la biblioteca: viven en kefy-content-images y tienen que aceptarse.
  it('acepta como referencia la imagen de un post anterior (kefy-content-images)', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockDb(makeItemsChain());
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'AAAA', revisedPrompt: null } as never);
    vi.mocked(uploadBase64Image).mockResolvedValueOnce('https://cdn.example.com/generated.jpeg');
    const previous = 'https://test.supabase.co/storage/v1/object/public/kefy-content-images/org-1/prev.jpeg';

    const res = await POST(makeReq({ prompt: 'un gato', reference_image_urls: [previous] }));

    expect(res.status).toBe(201);
    expect(vi.mocked(generateContentImage).mock.calls[0][0]).toMatchObject({ referenceImages: [previous] });
  });

  it('rechaza con 422 una referencia fuera del Storage de Kefy', async () => {
    const { POST } = await import('@/app/api/content/image/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockDb(makeItemsChain());

    const res = await POST(makeReq({ prompt: 'un gato', reference_image_urls: ['https://evil.example/a.png'] }));

    expect(res.status).toBe(422);
    expect(generateContentImage).not.toHaveBeenCalled();
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
