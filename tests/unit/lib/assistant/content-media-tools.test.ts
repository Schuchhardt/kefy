// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { creditsSpent, quotaState, resetQuotaState, resetSubscriptionState } from '../../helpers/quota';
import { IDS, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ai', () => ({
  generateContentText:    vi.fn(),
  generateContentImage:   vi.fn(),
  generateCarouselSlides: vi.fn(),
  generateReelScript:     vi.fn(),
  generateVideoScript:    vi.fn(),
  describeImageAsTopic:   vi.fn(),
}));
vi.mock('@/lib/services/media-ingest', () => ({
  ingestExternalMedia: vi.fn(async (_ctx: unknown, _url: string, kind: string) =>
    `https://test.supabase.co/storage/v1/object/public/kefy-content-media/${IDS.ORG}/imports/x.${kind === 'video' ? 'mp4' : 'jpg'}`),
}));

import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { generateCarouselSlides, generateContentImage, generateContentText, generateVideoScript } from '@/lib/ai';
import { ingestExternalMedia } from '@/lib/services/media-ingest';
import { normalizeVideoScript } from '@/lib/video/script';

// Parámetros de creación que antes no llegaban por MCP/API (tamaño, referencias,
// modelo), media en update_content, stories y conversión de formato.

const POST = IDS.uuid(200);
const STORY = IDS.uuid(201);
const OTHER_BRAND_ITEM = IDS.uuid(202);
const KEFY_REF = 'https://test.supabase.co/storage/v1/object/public/kefy-reference-images/a.jpg';
const ctx = () => apiCtx({ brandId: IDS.BRAND });
const item = (id: string) => db.rows('kefy_content_items').find((i) => i.id === id)!;

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  ensureToolsRegistered();
  db.seed('kefy_brand_kits', [{ id: IDS.uuid(50), org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Acme Café', tone: ['friendly'] }]);
  db.seed('kefy_content_items', [
    {
      id: POST, org_id: IDS.ORG, brand_id: IDS.BRAND, title: 'Promo', body: 'Café 2x1 los lunes', hashtags: [],
      content_type: 'post', channel: 'instagram', status: 'draft', slides: null, image_url: null, metadata: { created_via: 'ui' },
    },
    {
      id: STORY, org_id: IDS.ORG, brand_id: IDS.BRAND, title: null, body: 'Nuevo blend de otoño', hashtags: [],
      content_type: 'story', channel: 'instagram', status: 'draft', slides: null, metadata: {},
      image_url: 'https://test.supabase.co/storage/v1/object/public/kefy-content-images/story.jpg',
    },
    {
      id: OTHER_BRAND_ITEM, org_id: IDS.ORG, brand_id: IDS.BRAND_2, title: 'Bar', body: 'Happy hour', hashtags: [],
      content_type: 'post', channel: 'instagram', status: 'draft', slides: null, metadata: {},
    },
  ]);
  vi.mocked(generateContentText).mockResolvedValue({ body: 'Texto generado', hashtags: ['#cafe'], model: 'm', tokensUsed: 1 });
  vi.mocked(generateContentImage).mockResolvedValue({ b64: 'AAAA', revisedPrompt: 'x' });
});

describe('create_post', () => {
  it('pasa modelo, tamaño y referencias; re-aloja las referencias externas', async () => {
    const r = await executeTool('create_post', {
      topic: 'Café de otoño',
      model: 'gpt',
      image_size: '1024x1536',
      reference_image_urls: [KEFY_REF, 'https://example.com/producto.jpg'],
    }, ctx());

    expect(r.ok).toBe(true);
    expect(vi.mocked(generateContentText).mock.calls[0]![0].model).toBe('gpt');
    const [img] = vi.mocked(generateContentImage).mock.calls[0]!;
    expect(img.size).toBe('1024x1536');
    expect(img.referenceImages).toEqual([KEFY_REF, expect.stringContaining('/kefy-content-media/')]);
    // Solo la externa se descarga.
    expect(ingestExternalMedia).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ingestExternalMedia).mock.calls[0]![1]).toBe('https://example.com/producto.jpg');
  });

  it('rechaza más de 3 referencias sin gastar', async () => {
    const r = await executeTool('create_post', {
      topic: 'x', reference_image_urls: [KEFY_REF, KEFY_REF, KEFY_REF, KEFY_REF],
    }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(creditsSpent()).toBe(0);
  });
});

describe('generate_content_image', () => {
  it('genera vertical con referencias', async () => {
    const r = await executeTool('generate_content_image', {
      item_id: POST, prompt: 'Taza humeante', size: '1024x1792', reference_image_urls: [KEFY_REF],
    }, ctx());

    expect(r.ok).toBe(true);
    const [img] = vi.mocked(generateContentImage).mock.calls[0]!;
    expect(img.size).toBe('1024x1792');
    expect(img.referenceImages).toEqual([KEFY_REF]);
    expect(item(POST).image_url).toMatch(/^https:\/\/test\.supabase\.co\//);
  });
});

describe('update_content: imagen y video', () => {
  it('re-aloja una imagen externa y la pone como principal', async () => {
    const r = await executeTool('update_content', { item_id: POST, image_url: 'https://example.com/foto.jpg' }, ctx());

    expect(r.ok).toBe(true);
    expect(item(POST).image_url).toContain('/kefy-content-media/');
    // Cambiar solo la imagen no marca el texto como editado desde fuera.
    expect(item(POST).metadata).toEqual({ created_via: 'ui' });
  });

  it('una imagen ya en Kefy se guarda tal cual; null la quita', async () => {
    await executeTool('update_content', { item_id: POST, image_url: KEFY_REF }, ctx());
    expect(item(POST).image_url).toBe(KEFY_REF);
    expect(ingestExternalMedia).not.toHaveBeenCalled();

    await executeTool('update_content', { item_id: POST, image_url: null }, ctx());
    expect(item(POST).image_url).toBeNull();
  });

  it('video_url solo en reels y stories', async () => {
    const r = await executeTool('update_content', { item_id: POST, video_url: 'https://example.com/v.mp4' }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input' } });

    const ok = await executeTool('update_content', { item_id: STORY, video_url: 'https://example.com/v.mp4' }, ctx());
    expect(ok.ok).toBe(true);
    expect(item(STORY).video_url).toContain('.mp4');
  });
});

describe('create_story', () => {
  it('guarda una story con imagen vertical y cobra texto + imagen', async () => {
    const r = await executeTool('create_story', { topic: 'Blend de otoño', channel: 'instagram' }, ctx());

    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const data = r.data as { item_id: string; image_url: string | null };
    const saved = item(data.item_id);
    expect(saved).toMatchObject({ content_type: 'story', brand_id: IDS.BRAND, status: 'draft' });
    expect(saved.metadata).toMatchObject({ created_via: 'api' });
    expect(data.image_url).toBeTruthy();
    expect(vi.mocked(generateContentImage).mock.calls[0]![0].size).toBe('1024x1536');
    expect(creditsSpent()).toBe(4);
  });

  it('sin créditos para la imagen, la story se guarda sin ella y lo dice', async () => {
    // El texto cobra primero; después se acaban los créditos.
    vi.mocked(generateContentText).mockImplementationOnce(async () => {
      quotaState.quotaAllowed = false;
      return { body: 'Texto', hashtags: [], model: 'm', tokensUsed: 1 };
    });
    const r = await executeTool('create_story', { topic: 'x' }, ctx());

    expect(r).toMatchObject({ ok: true, data: { image_url: null, image_error: 'credits_exhausted' } });
    expect(generateContentImage).not.toHaveBeenCalled();
  });
});

describe('prepare_story_video', () => {
  it('escribe el guion y reutiliza la imagen de la story como primer plano', async () => {
    vi.mocked(generateVideoScript).mockResolvedValue({
      script: normalizeVideoScript({
        scenes: [
          { duration_seconds: 4, speaker: 'narrator', line: 'Llegó el otoño', visual: { kind: 'still', image_prompt: 'p1' } },
          { duration_seconds: 4, speaker: 'narrator', line: 'Pruébalo', visual: { kind: 'still', image_prompt: 'p2' } },
        ],
      }, 'en'),
      model: 'm', tokensUsed: 1,
    });

    const r = await executeTool('prepare_story_video', { item_id: STORY }, ctx());

    expect(r.ok).toBe(true);
    const saved = item(STORY);
    expect((saved.metadata as { video_script?: unknown }).video_script).toBeTruthy();
    expect((saved.slides as Array<{ image_url: string | null }>)[0]!.image_url).toBe(saved.image_url);
    expect(creditsSpent()).toBe(1);
  });

  it('un post no es una story: 422 sin cobrar', async () => {
    const r = await executeTool('prepare_story_video', { item_id: POST }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(creditsSpent()).toBe(0);
  });
});

describe('convert_content_format', () => {
  it('genera el carrusel a partir del post y lo guarda como rendición', async () => {
    vi.mocked(generateCarouselSlides).mockResolvedValue({
      slides: [
        { slide_order: 1, title: 'T1', body: 'B1', image_prompt: 'p1' },
        { slide_order: 2, title: 'T2', body: 'B2', image_prompt: 'p2' },
      ],
      description: 'Carrusel', hashtags: ['#a'], model: 'm', tokensUsed: 1,
    });

    const r = await executeTool('convert_content_format', { item_id: POST, format: 'carousel' }, ctx());

    expect(r).toMatchObject({ ok: true, data: { format: 'carousel', generated: true, status: 'ready' } });
    const rendition = db.rows('kefy_content_renditions').find((x) => x.content_item_id === POST);
    expect(rendition).toMatchObject({ format: 'carousel', status: 'ready' });
    expect(creditsSpent()).toBe(1 + 2 * 3);
    // El kit se lee por la marca de la pieza.
    expect(vi.mocked(generateCarouselSlides).mock.calls[0]![0].brandName).toBe('Acme Café');
  });

  it('el formato propio se devuelve sin generar nada', async () => {
    const r = await executeTool('convert_content_format', { item_id: POST, format: 'post' }, ctx());
    expect(r).toMatchObject({ ok: true, data: { generated: false } });
    expect(creditsSpent()).toBe(0);
  });

  it('una pieza de otra marca es 404', async () => {
    const r = await executeTool('convert_content_format', { item_id: OTHER_BRAND_ITEM, format: 'story' }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(creditsSpent()).toBe(0);
  });
});
