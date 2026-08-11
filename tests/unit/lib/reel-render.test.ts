import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresión: si el navegador se cerraba a mitad del render, nadie escribía el
// video_url y la fila quedaba en 'rendering' para siempre → el reel no se podía
// publicar nunca. reconcileRenderTarget resuelve ese estado desde el servidor.

const { mockGetRenderProgress } = vi.hoisted(() => ({ mockGetRenderProgress: vi.fn() }));
vi.mock('@remotion/lambda/client', () => ({ getRenderProgress: mockGetRenderProgress }));

import {
  reconcileRenderTarget,
  RENDER_TRIGGER_GRACE_MS,
  RENDER_STALE_MS,
  type RenderTarget,
} from '@/lib/reel-render';

const NOW = Date.parse('2026-08-10T12:00:00Z');

interface Update { table: string; patch: Record<string, unknown>; id: string }

function stubDb() {
  const updates: Update[] = [];
  const db = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ table, patch, id });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  };
  return { db, updates };
}

function target(metadata: Record<string, unknown>, overrides: Partial<RenderTarget> = {}): RenderTarget {
  return {
    table:        'kefy_content_items',
    id:           'item-1',
    metadata,
    videoUrl:     null,
    renderStatus: 'rendering',
    ...overrides,
  };
}

function startedAgo(ms: number) {
  return new Date(NOW - ms).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REMOTION_LAMBDA_FUNCTION_NAME = 'remotion-fn';
  process.env.REMOTION_AWS_REGION           = 'us-east-2';
});

describe('reconcileRenderTarget', () => {
  it('render terminado: guarda el video_url y marca ready', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockResolvedValue({ done: true, outputFile: 'https://s3.example.com/out.mp4' });

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(60_000),
    }), NOW);

    expect(outcome).toEqual({ status: 'ready', video_url: 'https://s3.example.com/out.mp4' });
    expect(updates).toEqual([{
      table: 'kefy_content_items',
      id:    'item-1',
      patch: { video_url: 'https://s3.example.com/out.mp4', render_status: 'ready' },
    }]);
  });

  it('render en curso: no toca la fila y reporta el progreso', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockResolvedValue({ done: false, overallProgress: 0.42 });

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(60_000),
    }), NOW);

    expect(outcome).toEqual({ status: 'rendering', progress: 0.42 });
    expect(updates).toHaveLength(0);
  });

  it('render con error fatal: vuelve a not_rendered y limpia los punteros de Lambda', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockResolvedValue({
      fatalErrorEncountered: true, errors: [{ message: 'Image failed to load' }],
    });

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(60_000), otra: 'cosa',
    }), NOW);

    expect(outcome).toMatchObject({ status: 'not_rendered', reason: 'render_failed', error: 'Image failed to load' });
    expect(updates[0].patch).toEqual({
      render_status: 'not_rendered',
      metadata:      { otra: 'cosa' },   // punteros muertos eliminados
    });
  });

  it('sin renderId dentro del margen de gracia: sigue considerándose en curso', async () => {
    const { db, updates } = stubDb();

    const outcome = await reconcileRenderTarget(
      db,
      target({ lambda_started_at: startedAgo(RENDER_TRIGGER_GRACE_MS - 1_000) }),
      NOW,
    );

    expect(outcome).toEqual({ status: 'rendering', progress: 0 });
    expect(updates).toHaveLength(0);
    expect(mockGetRenderProgress).not.toHaveBeenCalled();
  });

  it('sin renderId pasado el margen: el trigger se perdió → not_rendered', async () => {
    const { db, updates } = stubDb();

    const outcome = await reconcileRenderTarget(
      db,
      target({ lambda_started_at: startedAgo(RENDER_TRIGGER_GRACE_MS + 1_000) }),
      NOW,
    );

    expect(outcome).toEqual({ status: 'not_rendered', reason: 'trigger_lost' });
    expect(updates[0].patch).toMatchObject({ render_status: 'not_rendered' });
  });

  it('fila vieja sin ningún metadata (previa a este fix): se desbloquea', async () => {
    const { db, updates } = stubDb();

    const outcome = await reconcileRenderTarget(db, target({}), NOW);

    expect(outcome).toEqual({ status: 'not_rendered', reason: 'trigger_lost' });
    expect(updates).toHaveLength(1);
  });

  it('render colgado más allá del límite: se libera para reintentar', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockResolvedValue({ done: false, overallProgress: 0.1 });

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(RENDER_STALE_MS + 1_000),
    }), NOW);

    expect(outcome).toEqual({ status: 'not_rendered', reason: 'stale' });
    expect(updates[0].patch).toMatchObject({ render_status: 'not_rendered' });
  });

  it('si Lambda no responde: mantiene rendering mientras no sea antiguo', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockRejectedValue(new Error('AccessDenied'));

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(30_000),
    }), NOW);

    expect(outcome).toEqual({ status: 'rendering', progress: 0 });
    expect(updates).toHaveLength(0);
  });

  it('si Lambda no responde y el render es antiguo: lo libera', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockRejectedValue(new Error('render record not found'));

    const outcome = await reconcileRenderTarget(db, target({
      lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(RENDER_STALE_MS + 1),
    }), NOW);

    expect(outcome).toEqual({ status: 'not_rendered', reason: 'stale' });
    expect(updates).toHaveLength(1);
  });

  it('si ya hay video_url no consulta a Lambda', async () => {
    const { db, updates } = stubDb();

    const outcome = await reconcileRenderTarget(
      db,
      target({ lambda_render_id: 'r1', lambda_bucket: 'b1' }, { videoUrl: 'https://s3.example.com/ya.mp4' }),
      NOW,
    );

    expect(outcome).toEqual({ status: 'ready', video_url: 'https://s3.example.com/ya.mp4' });
    expect(mockGetRenderProgress).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('reconcilia también las rendiciones alternativas', async () => {
    const { db, updates } = stubDb();
    mockGetRenderProgress.mockResolvedValue({ done: true, outputFile: 'https://s3.example.com/rend.mp4' });

    await reconcileRenderTarget(db, target(
      { lambda_render_id: 'r1', lambda_bucket: 'b1', lambda_started_at: startedAgo(10_000) },
      { table: 'kefy_content_renditions', id: 'rend-1' },
    ), NOW);

    expect(updates[0]).toMatchObject({ table: 'kefy_content_renditions', id: 'rend-1' });
  });
});
