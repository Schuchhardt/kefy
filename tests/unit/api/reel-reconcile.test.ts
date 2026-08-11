import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// El cron que termina los renders que se quedaron a medias porque el navegador
// del usuario se cerró antes de que el poller guardara el video_url.

const mockSupabaseClient = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

const { mockReconcile } = vi.hoisted(() => ({ mockReconcile: vi.fn() }));
vi.mock('@/lib/reel-render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reel-render')>();
  return { ...actual, reconcileRenderTarget: mockReconcile };
});

import { getAuthFromRequest } from '@/lib/auth';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

/** Rows per table returned for the `render_status = 'rendering'` query. */
function stubDb(rows: Record<string, unknown[]>) {
  const filters: Array<{ table: string; col: string; value: unknown }> = [];

  mockSupabaseClient.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const proxy: Record<string, unknown> = new Proxy(chain, {
      get(_t, prop) {
        if (prop === 'then') {
          return (onOk: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows[table] ?? [], error: null }).then(onOk);
        }
        return (...args: unknown[]) => {
          if (prop === 'eq') filters.push({ table, col: String(args[0]), value: args[1] });
          return proxy;
        };
      },
    });
    return proxy;
  });

  return filters;
}

function req(headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest('http://localhost:3099/api/content/reel/reconcile', { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'secreto';
  mockReconcile.mockResolvedValue({ status: 'ready', video_url: 'https://s3.example.com/out.mp4' });
});

describe('GET /api/content/reel/reconcile', () => {
  it('rechaza sin el secreto del cron', async () => {
    const { GET } = await import('@/app/api/content/reel/reconcile/route');
    stubDb({});

    const res = await GET(req({ authorization: 'Bearer otro' }));

    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('reconcilia ítems y rendiciones en estado rendering', async () => {
    const { GET } = await import('@/app/api/content/reel/reconcile/route');
    const filters = stubDb({
      kefy_content_items: [
        { id: 'item-1', metadata: { lambda_render_id: 'r1' }, video_url: null, render_status: 'rendering' },
      ],
      kefy_content_renditions: [
        { id: 'rend-1', metadata: null, video_url: null, render_status: 'rendering' },
      ],
    });

    const res = await GET(req({ authorization: 'Bearer secreto' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ swept: 2, ready: 2 });
    expect(mockReconcile).toHaveBeenCalledTimes(2);
    expect(mockReconcile.mock.calls.map(([, t]) => t.table))
      .toEqual(['kefy_content_items', 'kefy_content_renditions']);
    // metadata nulo se normaliza a {} antes de reconciliar
    expect(mockReconcile.mock.calls[1][1].metadata).toEqual({});
    // solo barre filas que dicen estar renderizando
    expect(filters.every((f) => f.col !== 'render_status' || f.value === 'rendering')).toBe(true);
  });

  it('un fallo aislado no aborta el barrido', async () => {
    const { GET } = await import('@/app/api/content/reel/reconcile/route');
    stubDb({
      kefy_content_items: [
        { id: 'item-1', metadata: {}, video_url: null, render_status: 'rendering' },
        { id: 'item-2', metadata: {}, video_url: null, render_status: 'rendering' },
      ],
    });
    mockReconcile
      .mockRejectedValueOnce(new Error('AWS down'))
      .mockResolvedValueOnce({ status: 'not_rendered', reason: 'stale' });

    const body = await (await GET(req({ authorization: 'Bearer secreto' }))).json();

    expect(body).toMatchObject({ swept: 2, errors: 1, not_rendered: 1 });
  });
});

describe('POST /api/content/reel/reconcile', () => {
  it('permite a un owner reconciliar solo su propia organización', async () => {
    const { POST } = await import('@/app/api/content/reel/reconcile/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce(mockAuth as never);
    const filters = stubDb({
      kefy_content_items: [{ id: 'item-1', metadata: {}, video_url: null, render_status: 'rendering' }],
    });

    const res = await POST(req({}, 'POST'));

    expect(res.status).toBe(200);
    expect(filters).toContainEqual({ table: 'kefy_content_items', col: 'org_id', value: 'org-1' });
  });

  it('rechaza a un member', async () => {
    const { POST } = await import('@/app/api/content/reel/reconcile/route');
    vi.mocked(getAuthFromRequest).mockResolvedValueOnce({ ...mockAuth, role: 'member' } as never);
    stubDb({});

    const res = await POST(req({}, 'POST'));

    expect(res.status).toBe(403);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
