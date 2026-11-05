// Vista 2 de MCP Apps (lib/services/video-view.ts): plan con costos por nivel
// de animación, estado de la producción y story sin guion.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, apiCtx, seedWorkspace } from '../../helpers/assistant';
import { resetQuotaState, resetSubscriptionState } from '../../helpers/quota';
import { REEL_ID, STORY_ID, reelRow, storyRow } from '../../fixtures/mcp-app-items';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { buildVideoView, mapProduction, mapShots } from '@/lib/services/video-view';
import { scriptForTarget, type VideoTarget } from '@/lib/services/video';
import { VideoViewSchema } from '@/lib/mcp-app/contract';
import type { VideoJobSnapshot } from '@/lib/video/engine';

const ALL = { write: true, publish: true };
const ctx = () => apiCtx({ brandId: IDS.BRAND, source: 'mcp' });

function expectContract(view: unknown) {
  expect(VideoViewSchema.parse(view)).toEqual(view);
}

function reelTarget(): VideoTarget {
  const r = reelRow();
  return {
    table: 'kefy_content_items', id: r.id, itemId: r.id, format: 'reel', brandId: r.brand_id, slides: r.slides,
    metadata: {}, videoUrl: null, renderStatus: null, title: r.title, hook: r.body, hashtags: r.hashtags,
  };
}

const snapshot = (over: Partial<VideoJobSnapshot> = {}): VideoJobSnapshot => ({
  job_id: 'job-1', status: 'running', progress: 0.4, video_url: null, error: null, credits_estimate: 30, motion: 'key',
  steps: [
    { key: 'img_1', tool: 'generate_image', scene_id: null, status: 'done', error: null },
    { key: 'compose', tool: 'compose_video', scene_id: null, status: 'pending', error: null },
  ],
  ...over,
});

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  seedWorkspace(db);
});

describe('mapProduction', () => {
  it('etiquetas legibles, progreso acotado a 0–1 y null sin trabajo', () => {
    const p = mapProduction(snapshot({ progress: 3 }), null, 'es')!;
    expect(p.progress).toBe(1);
    expect(p.steps[0]).toMatchObject({ key: 'img_1', tool: 'generate_image', status: 'done', scene_order: null });
    expect(p.steps[0].label).not.toBe('generate_image');
    expect(mapProduction(null, null, 'es')).toBeNull();
  });

  it('el paso apunta al plano de su escena', () => {
    const script = scriptForTarget(reelTarget(), 'es')!;
    const scene = script.scenes[1];
    const p = mapProduction(snapshot({ steps: [{ key: 'tts', tool: 'text_to_speech', scene_id: scene.id, status: 'failed', error: 'boom' }] }), script, 'en')!;
    expect(p.steps[0]).toMatchObject({ scene_order: scene.order, status: 'failed', error: 'boom' });
  });
});

describe('mapShots', () => {
  it('un plano por escena con la foto de su slide y las herramientas que lo producen', () => {
    const script = scriptForTarget(reelTarget(), 'es')!;
    const shots = mapShots(script, reelRow().slides, [
      { tool: 'generate_image', scene_order: 1 }, { tool: 'text_to_speech', scene_order: 1 }, { tool: 'compose_video', scene_order: null },
    ], null);
    expect(shots).toHaveLength(script.scenes.length);
    expect(shots[0].image_url).toMatch(/reel-scene-1/);
    expect(shots[0].tools).toEqual(['generate_image', 'text_to_speech']);
    expect(shots[1].tools).toEqual([]);
  });
});

describe('buildVideoView', () => {
  it('story sin guion: needs_script, sin plan y sin error (el siguiente paso es prepare_story_video)', async () => {
    db.seed('kefy_content_items', [storyRow()]);
    const view = await buildVideoView(ctx(), { itemId: STORY_ID, withPlan: true, permissions: ALL });
    expectContract(view);
    expect(view).toMatchObject({ kind: 'video', format: 'story', needs_script: true, plan: null, plan_error: null, production: null });
    expect(view.credits.story_script).toBeGreaterThan(0);
  });

  it('reel con plan: costo de cada nivel de animación y storyboard', async () => {
    db.seed('kefy_content_items', [reelRow({ video_url: null, render_status: 'not_rendered' })]);
    const view = await buildVideoView(ctx(), { itemId: REEL_ID, motion: 'none', withPlan: true, permissions: ALL });
    expectContract(view);
    expect(view.needs_script).toBe(false);
    expect(view.plan).not.toBeNull();
    expect(view.plan!.motion).toBe('none');
    const { none, key, full } = view.plan!.credits_by_motion;
    expect(none).toBeLessThanOrEqual(key);
    expect(key).toBeLessThanOrEqual(full);
    expect(view.plan!.credits).toBe(none);
    expect(view.plan!.shots.length).toBeGreaterThan(0);
    expect(view.actions).toEqual({ approve: false, publish: false });
  });

  it('estado de produce_video / get_video_status: sin plan, con los pasos', async () => {
    db.seed('kefy_content_items', [reelRow({ video_url: null })]);
    const view = await buildVideoView(ctx(), { itemId: REEL_ID, withPlan: false, production: snapshot(), permissions: ALL });
    expectContract(view);
    expect(view.plan).toBeNull();
    expect(view.production).toMatchObject({ job_id: 'job-1', status: 'running', progress: 0.4 });
  });

  it('listo: el video del trabajo y, en borrador, aprobar; aprobado y con publish, publicar', async () => {
    db.seed('kefy_content_items', [reelRow({ video_url: null })]);
    const done = snapshot({ status: 'done', progress: 1, video_url: 'https://s3.us-east-2.amazonaws.com/b/renders/x/out.mp4' });
    const draft = await buildVideoView(ctx(), { itemId: REEL_ID, withPlan: false, production: done, permissions: ALL });
    expect(draft.item.video_url).toBe(done.video_url);
    expect(draft.actions).toEqual({ approve: true, publish: false });

    db.rows('kefy_content_items')[0].status = 'approved';
    const approved = await buildVideoView(ctx(), { itemId: REEL_ID, withPlan: false, production: done, permissions: ALL });
    expect(approved.actions).toEqual({ approve: false, publish: true });
    const noScope = await buildVideoView(ctx(), { itemId: REEL_ID, withPlan: false, production: done, permissions: { write: true, publish: false } });
    expect(noScope.actions.publish).toBe(false);
  });

  it('un post no se produce como video: plan null y format null', async () => {
    db.seed('kefy_content_items', [reelRow({ content_type: 'post', slides: null })]);
    const view = await buildVideoView(ctx(), { itemId: REEL_ID, withPlan: true, permissions: ALL });
    expectContract(view);
    expect(view).toMatchObject({ format: null, plan: null, needs_script: false });
  });

  it('una rendición inexistente es plan_error, no una excepción', async () => {
    db.seed('kefy_content_items', [reelRow({ content_type: 'post', slides: null })]);
    const view = await buildVideoView(ctx(), { itemId: REEL_ID, format: 'reel', withPlan: true, permissions: ALL });
    expect(view.plan_error).toMatchObject({ code: 'not_found' });
  });

  it('otra marca → not_found', async () => {
    db.seed('kefy_content_items', [reelRow({ brand_id: IDS.BRAND_2 })]);
    await expect(buildVideoView(ctx(), { itemId: REEL_ID, withPlan: false, permissions: ALL })).rejects.toMatchObject({ code: 'not_found' });
  });
});
