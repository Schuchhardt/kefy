import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Regresión (producción, item 0d0a38dd-…): desde un post se pulsaba «Generar
// versión de carrusel» y salía un carrusel que no tenía relación con el post —
// ni el texto ni las imágenes. El endpoint pasaba al generador sólo
// `topic = (title || body).slice(0, 500)` y generaba cada imagen desde cero,
// sin darle la pieza original ni su foto como referencia.
//
// Estas pruebas cubren TODAS las direcciones de conversión (post↔carrusel,
// carrusel↔reel, reel↔story…), no sólo la que se reportó.

const mockSupabaseClient = { from: vi.fn() };

vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/ai', () => ({
  generateContentText:    vi.fn(),
  generateContentImage:   vi.fn(),
  generateCarouselSlides: vi.fn(),
  generateReelScript:     vi.fn(),
}));

vi.mock('@/lib/storage', () => ({ uploadBase64Image: vi.fn() }));

import { getAuthFromRequest } from '@/lib/auth';
import {
  generateCarouselSlides,
  generateContentImage,
  generateContentText,
  generateReelScript,
} from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';
import { POST } from '@/app/api/content/[itemId]/renditions/route';

const auth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

const POST_ITEM = {
  id: 'item-1',
  content_type: 'post',
  channel: 'generic',
  title: null,
  body: '¿Publicar todos los días es la clave del éxito? Mentira. He visto marcas publicar 3 veces al día durante meses sin conseguir un cliente.',
  hashtags: ['#marketing'],
  image_url: 'https://cdn.example.com/post-cover.jpeg',
  slides: null,
  video_url: null,
  mux_playback_id: null,
  mux_asset_id: null,
  render_status: null,
};

const CAROUSEL_ITEM = {
  ...POST_ITEM,
  content_type: 'carousel',
  title: 'Frecuencia vs. constancia',
  body: 'Descripción del carrusel',
  image_url: 'https://cdn.example.com/s1.jpeg',
  slides: [
    { slide_order: 1, title: 'Publicar más no es mejor', body: 'La frecuencia sin estrategia no vende', image_url: 'https://cdn.example.com/s1.jpeg' },
    { slide_order: 2, title: 'Lo que sí funciona',       body: 'Constancia con mensaje claro',        image_url: 'https://cdn.example.com/s2.jpeg' },
  ],
};

const REEL_ITEM = {
  ...POST_ITEM,
  content_type: 'reel',
  title: 'Guion del reel',
  image_url: 'https://cdn.example.com/scene1.jpeg',
  slides: [
    { scene_order: 1, title: 'Hook', body: 'Publicar a diario no vende', duration_seconds: 3, image_url: 'https://cdn.example.com/scene1.jpeg' },
  ],
};

/** Encadena las tablas que toca el endpoint, en el orden en que las consulta. */
function mockDb(item: unknown, existing: unknown = null) {
  const upserted: Record<string, unknown>[] = [];

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'kefy_content_items') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: item, error: null }),
      };
    }
    if (table === 'kefy_brand_kits') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'kit-1', name: 'Kefy', tagline: null, tone: [], industry: null, primary_color: '#000', secondary_color: '#111', accent_color: '#c6ff4b' },
          error: null,
        }),
      };
    }
    // kefy_content_renditions
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      upsert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        upserted.push(row);
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'r1', ...row }, error: null }),
        };
      }),
    };
  });

  return upserted;
}

function call(itemId: string, format: string) {
  const req = new NextRequest(`http://localhost:3097/api/content/${itemId}/renditions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  return POST(req, { params: Promise.resolve({ itemId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
  vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/generated.jpeg');
  vi.mocked(generateContentImage).mockResolvedValue({ b64: 'AAAA', revisedPrompt: 'x' });
  vi.mocked(generateContentText).mockResolvedValue({ body: 'texto adaptado', hashtags: ['#a'], model: 'm', tokensUsed: 1 });
  vi.mocked(generateCarouselSlides).mockResolvedValue({
    slides: [{ slide_order: 1, title: 'T1', body: 'B1', image_prompt: 'fondo 1' }],
    description: 'desc', hashtags: ['#a'], model: 'm', tokensUsed: 1,
  });
  vi.mocked(generateReelScript).mockResolvedValue({
    scenes: [{ scene_order: 1, title: 'T1', body: 'B1', image_prompt: 'fondo 1', duration_seconds: 3 }],
    hook: 'hook', hashtags: ['#a'], model: 'm', tokensUsed: 1,
  });
});

describe('POST /api/content/[itemId]/renditions — la conversión parte del original', () => {
  it('post → carrusel: el generador recibe el post completo como contenido de origen', async () => {
    mockDb(POST_ITEM);
    const res = await call('item-1', 'carousel');
    expect(res.status).toBe(201);

    const [opts] = vi.mocked(generateCarouselSlides).mock.calls[0];
    expect(opts.source).toBeDefined();
    expect(opts.source!.format).toBe('post');
    // El cuerpo entero, no los primeros 500 caracteres mezclados en `topic`.
    expect(opts.source!.body).toBe(POST_ITEM.body);
    expect(opts.source!.imageUrls).toContain('https://cdn.example.com/post-cover.jpeg');
  });

  it('post → carrusel: cada imagen de slide usa la foto del post como referencia visual', async () => {
    mockDb(POST_ITEM);
    await call('item-1', 'carousel');

    const [imgOpts] = vi.mocked(generateContentImage).mock.calls[0];
    expect(imgOpts.referenceImages).toEqual(['https://cdn.example.com/post-cover.jpeg']);
    expect(imgOpts.prompt).toMatch(/reference image/i);
  });

  it('post → carrusel: los slides se guardan con la imagen LIMPIA, sin texto quemado', async () => {
    const upserted = mockDb(POST_ITEM);
    await call('item-1', 'carousel');

    const slides = upserted[0].slides as Array<{ text_baked?: boolean }>;
    expect(slides[0].text_baked).toBe(false);
  });

  it('carrusel → reel: el guion recibe el texto de cada slide del carrusel', async () => {
    mockDb(CAROUSEL_ITEM);
    await call('item-1', 'reel');

    const [opts] = vi.mocked(generateReelScript).mock.calls[0];
    expect(opts.source!.format).toBe('carousel');
    expect(opts.source!.slideTexts).toEqual([
      'Publicar más no es mejor — La frecuencia sin estrategia no vende',
      'Lo que sí funciona — Constancia con mensaje claro',
    ]);
  });

  it('carrusel → reel: las escenas se generan con las imágenes del carrusel como referencia', async () => {
    mockDb(CAROUSEL_ITEM);
    await call('item-1', 'reel');

    const [imgOpts] = vi.mocked(generateContentImage).mock.calls[0];
    expect(imgOpts.referenceImages).toEqual([
      'https://cdn.example.com/s1.jpeg',
      'https://cdn.example.com/s2.jpeg',
    ]);
  });

  it('reel → story: hereda el guion y la escena como referencia', async () => {
    mockDb(REEL_ITEM);
    await call('item-1', 'story');

    const [textOpts] = vi.mocked(generateContentText).mock.calls[0];
    expect(textOpts.source!.format).toBe('reel');

    const [imgOpts] = vi.mocked(generateContentImage).mock.calls[0];
    expect(imgOpts.referenceImages).toEqual(['https://cdn.example.com/scene1.jpeg']);
  });

  it('carrusel → post: el texto se reescribe a partir del carrusel, con su portada de referencia', async () => {
    mockDb(CAROUSEL_ITEM);
    await call('item-1', 'post');

    const [textOpts] = vi.mocked(generateContentText).mock.calls[0];
    expect(textOpts.source!.format).toBe('carousel');
    expect(textOpts.source!.slideTexts?.length).toBe(2);

    const [imgOpts] = vi.mocked(generateContentImage).mock.calls[0];
    expect(imgOpts.referenceImages?.length).toBeGreaterThan(0);
  });

  it('todas las combinaciones de formato pasan el origen al generador', async () => {
    const items = [POST_ITEM, CAROUSEL_ITEM, REEL_ITEM];
    for (const item of items) {
      for (const format of ['post', 'carousel', 'reel', 'story']) {
        if (format === item.content_type) continue;
        vi.clearAllMocks();
        vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
        vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn.example.com/generated.jpeg');
        vi.mocked(generateContentImage).mockResolvedValue({ b64: 'AAAA', revisedPrompt: 'x' });
        vi.mocked(generateContentText).mockResolvedValue({ body: 'texto', hashtags: [], model: 'm', tokensUsed: 1 });
        vi.mocked(generateCarouselSlides).mockResolvedValue({ slides: [{ slide_order: 1, title: 'T', body: 'B', image_prompt: 'p' }], description: 'd', hashtags: [], model: 'm', tokensUsed: 1 });
        vi.mocked(generateReelScript).mockResolvedValue({ scenes: [{ scene_order: 1, title: 'T', body: 'B', image_prompt: 'p', duration_seconds: 3 }], hook: 'h', hashtags: [], model: 'm', tokensUsed: 1 });
        mockDb(item);

        const res = await call('item-1', format);
        expect(res.status, `${item.content_type} → ${format}`).toBe(201);

        const generator = format === 'carousel' ? generateCarouselSlides
          : format === 'reel' ? generateReelScript
          : generateContentText;
        const [opts] = vi.mocked(generator).mock.calls[0] as [{ source?: { format: string; body?: string | null } }];
        expect(opts.source?.format, `${item.content_type} → ${format}`).toBe(item.content_type);
        expect(opts.source?.body, `${item.content_type} → ${format}`).toBe(item.body);

        // Y en todas, la imagen se guía por las del original.
        const [imgOpts] = vi.mocked(generateContentImage).mock.calls[0];
        expect(imgOpts.referenceImages?.length, `${item.content_type} → ${format}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('POST /api/content/[itemId]/renditions — casos límite', () => {
  it('el formato propio del ítem se devuelve tal cual, sin generar nada', async () => {
    mockDb(POST_ITEM);
    const res = await call('item-1', 'post');
    expect(res.status).toBe(200);
    expect(generateContentText).not.toHaveBeenCalled();
  });

  it('una rendición ya lista es idempotente: no se vuelve a generar', async () => {
    mockDb(POST_ITEM, { id: 'r1', format: 'carousel', status: 'ready' });
    const res = await call('item-1', 'carousel');
    expect(res.status).toBe(200);
    expect(generateCarouselSlides).not.toHaveBeenCalled();
  });

  it('un ítem sin texto no puede derivar otro formato', async () => {
    mockDb({ ...POST_ITEM, title: null, body: null });
    const res = await call('item-1', 'carousel');
    expect(res.status).toBe(422);
  });

  it('un formato desconocido se rechaza', async () => {
    mockDb(POST_ITEM);
    const res = await call('item-1', 'gif');
    expect(res.status).toBe(422);
  });
});
