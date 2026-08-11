import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Cableado de /api/content/reel/render con el reconciliador: ni el polling ni
// un segundo POST pueden dejar la fila atrapada en 'rendering'.

const mockSupabaseClient = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

const { mockRenderMedia, mockReconcile } = vi.hoisted(() => ({
  mockRenderMedia: vi.fn(),
  mockReconcile:   vi.fn(),
}));
vi.mock('@remotion/lambda/client', () => ({ renderMediaOnLambda: mockRenderMedia }));
vi.mock('@/lib/reel-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reel-render')>();
  return { ...actual, reconcileRenderTarget: mockReconcile };
});

import { getAuthFromRequest } from '@/lib/auth';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

interface Update { table: string; patch: Record<string, unknown> }

function stubDb(item: Record<string, unknown>) {
  const updates: Update[] = [];

  mockSupabaseClient.from.mockImplementation((table: string) => {
    const data = table === 'kefy_content_items' ? item : null;
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (onOk: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(onOk);
        }
        return (...args: unknown[]) => {
          if (prop === 'update') updates.push({ table, patch: args[0] as Record<string, unknown> });
          if (prop === 'single' || prop === 'maybeSingle') return Promise.resolve({ data, error: null });
          return proxy;
        };
      },
    });
    return proxy;
  });

  return updates;
}

const RENDERING_ITEM = {
  id:            'item-1',
  content_type:  'reel',
  slides:        [{ scene_order: 1, title: 'a', body: 'b', duration_seconds: 3 }],
  metadata:      { lambda_render_id: 'r1', lambda_bucket: 'b1' },
  mux_playback_id: null,
  video_url:     null,
  render_status: 'rendering',
};

function getReq() {
  return new NextRequest('http://localhost:3099/api/content/reel/render?itemId=item-1');
}

function postReq(body: unknown) {
  return new NextRequest('http://localhost:3099/api/content/reel/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REMOTION_AWS_REGION           = 'us-east-2';
  process.env.REMOTION_LAMBDA_FUNCTION_NAME = 'remotion-fn';
  process.env.REMOTION_SERVE_URL            = 'https://serve.example.com/index.html';
  mockRenderMedia.mockResolvedValue({ renderId: 'r-new', bucketName: 'bucket-new' });
});

describe('GET /api/content/reel/render', () => {
  it('render terminado mientras nadie poleaba: devuelve el video_url', async () => {
    const { GET } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'ready', video_url: 'https://s3.example.com/out.mp4' });

    const body = await (await GET(getReq())).json();

    expect(body).toEqual({ render_status: 'ready', video_url: 'https://s3.example.com/out.mp4' });
  });

  it('render perdido: responde not_rendered para que el cliente reintente', async () => {
    const { GET } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'not_rendered', reason: 'trigger_lost' });

    const body = await (await GET(getReq())).json();

    expect(body).toMatchObject({ render_status: 'not_rendered', reason: 'trigger_lost' });
  });

  it('render fallido: responde error con el mensaje de Lambda', async () => {
    const { GET } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'not_rendered', reason: 'render_failed', error: 'Image 404' });

    const body = await (await GET(getReq())).json();

    expect(body).toMatchObject({ render_status: 'error', error: 'Image 404' });
  });
});

describe('POST /api/content/reel/render', () => {
  it('con un render vivo en curso: no dispara un segundo render', async () => {
    const { POST } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'rendering', progress: 0.3 });

    const res = await POST(postReq({ itemId: 'item-1' }));

    expect(res.status).toBe(202);
    expect(mockRenderMedia).not.toHaveBeenCalled();
  });

  it('con un render en curso ya terminado: devuelve el video sin re-renderizar', async () => {
    const { POST } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'ready', video_url: 'https://s3.example.com/out.mp4' });

    const body = await (await POST(postReq({ itemId: 'item-1' }))).json();

    expect(body).toMatchObject({ render_status: 'ready', video_url: 'https://s3.example.com/out.mp4' });
    expect(mockRenderMedia).not.toHaveBeenCalled();
  });

  it('con un render muerto: lo descarta y lanza uno nuevo', async () => {
    const { POST } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const updates = stubDb(RENDERING_ITEM);
    mockReconcile.mockResolvedValue({ status: 'not_rendered', reason: 'stale' });

    const res = await POST(postReq({ itemId: 'item-1' }));

    expect(res.status).toBe(202);
    expect(mockRenderMedia).toHaveBeenCalledTimes(1);

    // El sello de inicio se escribe ANTES de disparar Lambda: es lo que permite
    // distinguir "recién arrancado" de "trigger perdido" si esta función muere.
    const renderingUpdate = updates.find((u) => u.patch.render_status === 'rendering');
    expect(renderingUpdate).toBeTruthy();
    const startedAt = (renderingUpdate!.patch.metadata as Record<string, unknown>).lambda_started_at;
    expect(typeof startedAt).toBe('string');
    // Y los punteros del render nuevo quedan persistidos junto al sello
    const metadataUpdate = updates.find((u) => (u.patch.metadata as Record<string, unknown>)?.lambda_render_id);
    expect(metadataUpdate!.patch.metadata).toMatchObject({
      lambda_render_id:  'r-new',
      lambda_bucket:     'bucket-new',
      lambda_started_at: startedAt,
    });
  });

  it('ítem ya renderizado: devuelve el video sin tocar Lambda', async () => {
    const { POST } = await import('@/app/api/content/reel/render/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    stubDb({ ...RENDERING_ITEM, video_url: 'https://s3.example.com/ya.mp4', render_status: 'ready' });

    const body = await (await POST(postReq({ itemId: 'item-1' }))).json();

    expect(body).toMatchObject({ render_status: 'ready', video_url: 'https://s3.example.com/ya.mp4' });
    expect(mockRenderMedia).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
