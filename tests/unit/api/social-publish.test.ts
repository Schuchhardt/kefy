import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Regresión (producción): al publicar un reel en Facebook/Instagram/TikTok se
// publicaba la PORTADA como imagen en vez del video, sin ningún error.
// Estos tests cubren /api/social/publish y /api/social/schedule para que el
// servidor nunca degrade un reel a imagen.

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = { from: vi.fn() };

vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

const mockPublishPost = vi.fn();
vi.mock('@/lib/zernio', () => ({
  publishPost: mockPublishPost,
  STORY_CAPABLE_PLATFORMS: new Set(['instagram', 'facebook', 'snapchat']),
}));

const mockResizeForFormat = vi.fn();
const mockCompositeStoryText = vi.fn();
vi.mock('@/lib/image-processor', () => ({
  resizeForFormat: mockResizeForFormat,
  compositeStoryText: mockCompositeStoryText,
}));

const mockUploadBase64Image = vi.fn();
vi.mock('@/lib/storage', () => ({ uploadBase64Image: mockUploadBase64Image }));

import { getAuthFromRequest } from '@/lib/auth';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

// ─── Supabase chain stub ──────────────────────────────────────────────────────
// Every query builder method returns the same thenable proxy; the awaited /
// terminal value is whatever the table was configured with.

type TableResults = Record<string, unknown>;

interface Recorded { table: string; method: string; args: unknown[] }

function stubDb(results: TableResults) {
  const calls: Recorded[] = [];

  mockSupabaseClient.from.mockImplementation((table: string) => {
    const result = { data: results[table] ?? null, error: null };
    const proxy: Record<string | symbol, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
            Promise.resolve(result).then(onOk, onErr);
        }
        return (...args: unknown[]) => {
          calls.push({ table, method: String(prop), args });
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(result);
          return proxy;
        };
      },
    }) as Record<string | symbol, unknown>;
    return proxy;
  });

  return calls;
}

const ACCOUNTS = [
  { id: 'sa-ig', zernio_account_id: 'z-ig', status: 'active', platform: 'instagram' },
  { id: 'sa-fb', zernio_account_id: 'z-fb', status: 'active', platform: 'facebook' },
  { id: 'sa-tt', zernio_account_id: 'z-tt', status: 'active', platform: 'tiktok' },
];
const ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);

function reelItem(overrides: Record<string, unknown> = {}) {
  return {
    id:              'item-1',
    body:            'Mi reel',
    image_url:       'https://cdn.example.com/cover.jpg',
    hashtags:        ['kefy'],
    channel:         'instagram',
    content_type:    'reel',
    slides:          [{ image_url: 'https://cdn.example.com/cover.jpg' }],
    video_url:       null,
    mux_playback_id: null,
    status:          'approved',
    ...overrides,
  };
}

function publishReq(body: unknown) {
  return new NextRequest('http://localhost:3099/api/social/publish', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

function scheduleReq(body: unknown) {
  return new NextRequest('http://localhost:3099/api/social/schedule', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockPublishPost.mockResolvedValue({
    post_id: 'z-post-1', platform_post_id: 'pp-1', status: 'published',
    published_at: '2026-08-10T00:00:00Z', scheduled_at: null,
  });
  // Any image download fails → the route keeps the original URL (no resizing).
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});

// ─── POST /api/social/publish ─────────────────────────────────────────────────

describe('POST /api/social/publish — reel', () => {
  it('devuelve 401 sin auth', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(null);

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS }));
    expect(res.status).toBe(401);
  });

  it('reel SIN video: 422 y no publica nada (no cae a la imagen de portada)', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const calls = stubDb({ kefy_content_items: reelItem(), kefy_social_accounts: ACCOUNTS });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS }));

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/reel/i);
    expect(mockPublishPost).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'kefy_scheduled_posts' && c.method === 'insert')).toBe(false);
  });

  it('reel con mux_playback_id legacy y sin video_url: 422', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({ kefy_content_items: reelItem({ mux_playback_id: 'mux-123' }), kefy_social_accounts: ACCOUNTS });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS }));

    expect(res.status).toBe(422);
    expect(mockPublishPost).not.toHaveBeenCalled();
  });

  it('reel CON video: publica el video en las 3 redes y nunca manda image_url', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({
      kefy_content_items:   reelItem({ video_url: 'https://s3.example.com/reel.mp4' }),
      kefy_social_accounts: ACCOUNTS,
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS }));

    expect(res.status).toBe(200);
    expect(mockPublishPost).toHaveBeenCalledTimes(3);
    for (const [payload] of mockPublishPost.mock.calls) {
      expect(payload.video_url).toBe('https://s3.example.com/reel.mp4');
      expect(payload.image_url).toBeUndefined();
      expect(payload.media_urls).toBeUndefined();
      expect(payload.content_type).toBe('reel');
    }
    expect(mockPublishPost.mock.calls.map(([p]) => p.platform)).toEqual(['instagram', 'facebook', 'tiktok']);
  });

  it('reel como rendición alternativa sin video: 422', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({
      kefy_content_items: reelItem({ content_type: 'post' }),
      kefy_content_renditions: {
        body: 'Versión reel', image_url: 'https://cdn.example.com/cover.jpg',
        slides: [], video_url: null, mux_playback_id: null, hashtags: [], status: 'ready',
      },
      kefy_social_accounts: ACCOUNTS,
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS, format: 'reel' }));

    expect(res.status).toBe(422);
    expect(mockPublishPost).not.toHaveBeenCalled();
  });

  it('reel como rendición alternativa con video: publica el video de la rendición', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({
      kefy_content_items: reelItem({ content_type: 'post', video_url: null }),
      kefy_content_renditions: {
        body: 'Versión reel', image_url: 'https://cdn.example.com/cover.jpg',
        slides: [], video_url: 'https://s3.example.com/rendition.mp4',
        mux_playback_id: null, hashtags: ['kefy'], status: 'ready',
      },
      kefy_social_accounts: [ACCOUNTS[0]],
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ['sa-ig'], format: 'reel' }));

    expect(res.status).toBe(200);
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.video_url).toBe('https://s3.example.com/rendition.mp4');
    expect(payload.image_url).toBeUndefined();
  });
});

describe('POST /api/social/publish — otros formatos', () => {
  it('story sin video: sigue publicando la imagen (fallback si el fetch falla)', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({
      kefy_content_items:   reelItem({ content_type: 'story', slides: null }),
      kefy_social_accounts: [ACCOUNTS[0]],
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ['sa-ig'] }));

    expect(res.status).toBe(200);
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.image_url).toBe('https://cdn.example.com/cover.jpg');
    expect(payload.video_url).toBeUndefined();
  });

  it('story sin video en Instagram: compone el texto sobre la imagen', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const fakeImageBuf = new ArrayBuffer(100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(fakeImageBuf) }));
    mockResizeForFormat.mockResolvedValue(Buffer.from('resized'));
    mockCompositeStoryText.mockResolvedValue(Buffer.from('composited'));
    mockUploadBase64Image.mockResolvedValue('https://cdn.example.com/composited.jpeg');

    stubDb({
      kefy_content_items:   reelItem({ content_type: 'story', slides: null }),
      kefy_social_accounts: [ACCOUNTS[0]],
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ['sa-ig'] }));

    expect(res.status).toBe(200);
    // Tercer argumento: la plataforma, que define la zona segura donde se
    // escribe el caption (TikTok tapa una franja mucho mayor que Instagram).
    // Cuarto: las tipografías del Brand Kit, para escribir con la fuente de la marca.
    expect(mockCompositeStoryText).toHaveBeenCalledWith(
      Buffer.from('resized'), 'Mi reel', 'instagram', expect.objectContaining({ heading: undefined }),
    );
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.image_url).toBe('https://cdn.example.com/composited.jpeg');
  });

  it('story sin video en TikTok: NO compone texto (no es story-capable)', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);

    const fakeImageBuf = new ArrayBuffer(100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(fakeImageBuf) }));
    mockResizeForFormat.mockResolvedValue(Buffer.from('resized'));
    mockUploadBase64Image.mockResolvedValue('https://cdn.example.com/resized.jpeg');

    stubDb({
      kefy_content_items:   reelItem({ content_type: 'story', slides: null }),
      kefy_social_accounts: [ACCOUNTS[2]], // TikTok
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ['sa-tt'] }));

    expect(res.status).toBe(200);
    expect(mockCompositeStoryText).not.toHaveBeenCalled();
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.image_url).toBe('https://cdn.example.com/resized.jpeg');
  });

  it('carousel: manda las slides sin duplicar la portada', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({
      kefy_content_items: reelItem({
        content_type: 'carousel',
        image_url: 'https://cdn.example.com/slide-1.jpg',
        slides: [
          { image_url: 'https://cdn.example.com/slide-1.jpg' },
          { image_url: 'https://cdn.example.com/slide-2.jpg' },
        ],
      }),
      kefy_social_accounts: [ACCOUNTS[0]],
    });

    const res = await POST(publishReq({ content_item_id: 'item-1', social_account_ids: ['sa-ig'] }));

    expect(res.status).toBe(200);
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.media_urls).toEqual([
      'https://cdn.example.com/slide-1.jpg',
      'https://cdn.example.com/slide-2.jpg',
    ]);
    expect(payload.image_url).toBeUndefined();
  });
});

// ─── POST /api/social/schedule ────────────────────────────────────────────────

describe('POST /api/social/schedule — reel', () => {
  it('reel sin video: 422 y no programa nada', async () => {
    const { POST } = await import('@/app/api/social/schedule/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const calls = stubDb({ kefy_content_items: reelItem(), kefy_social_accounts: ACCOUNTS });

    const res = await POST(scheduleReq({
      content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS, scheduled_at: FUTURE,
    }));

    expect(res.status).toBe(422);
    expect(mockPublishPost).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === 'kefy_scheduled_posts' && c.method === 'insert')).toBe(false);
  });

  it('story sin video: compone texto sobre la imagen para Instagram', async () => {
    const { POST } = await import('@/app/api/social/schedule/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockPublishPost.mockResolvedValue({
      post_id: 'z-post-1', platform_post_id: null, status: 'scheduled',
      published_at: null, scheduled_at: FUTURE,
    });

    const fakeImageBuf = new ArrayBuffer(100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(fakeImageBuf) }));
    mockResizeForFormat.mockResolvedValue(Buffer.from('resized'));
    mockCompositeStoryText.mockResolvedValue(Buffer.from('composited'));
    mockUploadBase64Image.mockResolvedValue('https://cdn.example.com/composited.jpeg');

    stubDb({
      kefy_content_items:   reelItem({ content_type: 'story', slides: null }),
      kefy_social_accounts: [ACCOUNTS[0]],
      kefy_scheduled_posts: { id: 'sp-1' },
    });

    const res = await POST(scheduleReq({
      content_item_id: 'item-1', social_account_ids: ['sa-ig'], scheduled_at: FUTURE,
    }));

    expect(res.status).toBe(201);
    expect(mockCompositeStoryText).toHaveBeenCalled();
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.image_url).toBe('https://cdn.example.com/composited.jpeg');
  });

  it('post con imagen: ahora la ajusta por red antes de programar (antes iba sin tocar)', async () => {
    const { POST } = await import('@/app/api/social/schedule/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockPublishPost.mockResolvedValue({
      post_id: 'z-post-1', platform_post_id: null, status: 'scheduled',
      published_at: null, scheduled_at: FUTURE,
    });

    const fakeImageBuf = new ArrayBuffer(100);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(fakeImageBuf) }));
    mockResizeForFormat.mockResolvedValue(Buffer.from('fitted'));
    mockUploadBase64Image.mockResolvedValue('https://cdn.example.com/fitted.jpeg');

    stubDb({
      kefy_content_items:   reelItem({ content_type: 'post', slides: null, image_url: 'https://cdn.example.com/foto.jpg' }),
      kefy_social_accounts: [ACCOUNTS[0]],
      kefy_scheduled_posts: { id: 'sp-1' },
    });

    const res = await POST(scheduleReq({
      content_item_id: 'item-1', social_account_ids: ['sa-ig'], scheduled_at: FUTURE,
    }));

    expect(res.status).toBe(201);
    expect(mockResizeForFormat).toHaveBeenCalledWith(expect.any(Buffer), 'instagram', 'post');
    expect(mockCompositeStoryText).not.toHaveBeenCalled();
    const [payload] = mockPublishPost.mock.calls[0];
    expect(payload.image_url).toBe('https://cdn.example.com/fitted.jpeg');
  });

  it('reel con video: programa el video sin imagen', async () => {
    const { POST } = await import('@/app/api/social/schedule/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    mockPublishPost.mockResolvedValue({
      post_id: 'z-post-1', platform_post_id: null, status: 'scheduled',
      published_at: null, scheduled_at: FUTURE,
    });
    stubDb({
      kefy_content_items:   reelItem({ video_url: 'https://s3.example.com/reel.mp4' }),
      kefy_social_accounts: ACCOUNTS,
      kefy_scheduled_posts: { id: 'sp-1' },
    });

    const res = await POST(scheduleReq({
      content_item_id: 'item-1', social_account_ids: ACCOUNT_IDS, scheduled_at: FUTURE,
    }));

    expect(res.status).toBe(201);
    expect(mockPublishPost).toHaveBeenCalledTimes(3);
    for (const [payload] of mockPublishPost.mock.calls) {
      expect(payload.video_url).toBe('https://s3.example.com/reel.mp4');
      expect(payload.image_url).toBeUndefined();
      expect(payload.scheduled_at).toBe(FUTURE);
    }
  });
});
