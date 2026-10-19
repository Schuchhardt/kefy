import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { consumedCount, creditsSpent, quotaState, refundCount, resetQuotaState } from '../../helpers/quota';
import type { ToolResult, VideoTool, VideoToolName } from '@/lib/video/tools/types';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

// Herramientas falsas: cada una responde lo que diga `behavior` para su nombre.
type Behavior = (input: Record<string, unknown>, stepKey: string) => ToolResult | Promise<ToolResult>;
const behavior: Partial<Record<VideoToolName, Behavior>> = {};
const pollBehavior: Partial<Record<VideoToolName, Behavior>> = {};
const runs: Array<{ tool: VideoToolName; stepKey: string; input: Record<string, unknown> }> = [];

function fakeTool(name: VideoToolName, mode: 'sync' | 'async', credit: VideoTool['credit']): VideoTool {
  return {
    name, mode, credit, provider: 'fal',
    label: { es: name, en: name }, summary: { es: name, en: name },
    available: () => true,
    run: async (ctx, input) => {
      runs.push({ tool: name, stepKey: ctx.stepKey, input });
      return behavior[name]!(input, ctx.stepKey);
    },
    poll: async (ctx, handle) => pollBehavior[name]!(handle, ctx.stepKey),
  };
}

vi.mock('@/lib/video/tools', () => {
  const tools: Record<string, VideoTool> = {
    generate_image: fakeTool('generate_image', 'sync', 'image'),
    text_to_speech: fakeTool('text_to_speech', 'sync', 'voice'),
    animate_image:  fakeTool('animate_image', 'async', 'animation'),
    lip_sync:       fakeTool('lip_sync', 'async', 'lipsync'),
    compose_video:  fakeTool('compose_video', 'async', 'video'),
  };
  return { getVideoTool: (n: string) => tools[n] ?? null, VIDEO_TOOLS: tools };
});

import { advanceVideoJob, createVideoJob, MAX_STEP_ATTEMPTS } from '@/lib/video/engine';
import { compileVideoPlan } from '@/lib/video/plan';
import { normalizeVideoScript } from '@/lib/video/script';
import { OPERATION_CREDIT_COSTS as C } from '@/lib/plans';

const script = normalizeVideoScript({
  characters: [{ id: 'ana', name: 'Ana', look: 'barista', voice: 'coral' }],
  scenes: [
    { duration_seconds: 3, speaker: 'ana', line: 'Hola', visual: { kind: 'talking', image_prompt: 'a', character_ids: ['ana'] } },
    { duration_seconds: 3, speaker: 'narrator', line: 'Chao', visual: { kind: 'still', image_prompt: 'b' } },
  ],
}, 'es');

async function newJob() {
  db.seed('kefy_content_items', [{ id: 'item-1', org_id: 'org-1', render_status: 'rendering', video_url: null, slides: [], metadata: {} }]);
  const plan = compileVideoPlan(script, { capabilities: { animation: true, lipsync: true } });
  return createVideoJob(db.client, {
    orgId: 'org-1', brandId: null, userId: 'u1',
    target: { table: 'kefy_content_items', id: 'item-1' },
    script, plan, renderContext: { plan: 'pro', name: 'Marca', accentColor: '#c6ff4b' },
  });
}

function step(key: string) {
  return db.find('kefy_video_steps', (r) => r.key === key)!;
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  runs.length = 0;
  behavior.generate_image = (_i, key) => ({ status: 'done', output: { image_url: `https://cdn/${key}.jpg` } });
  behavior.text_to_speech = () => ({ status: 'done', output: { audio_url: 'https://cdn/v.wav', duration_seconds: 1.5, words: [] } });
  behavior.animate_image  = (_i, key) => ({ status: 'pending', handle: { request_id: key } });
  behavior.lip_sync       = () => ({ status: 'pending', handle: { request_id: 'lips' } });
  behavior.compose_video  = () => ({ status: 'pending', handle: { render_id: 'r1', bucket: 'b' } });
  pollBehavior.animate_image = () => ({ status: 'done', output: { video_url: 'https://cdn/anim.mp4', clip_seconds: 5 } });
  pollBehavior.lip_sync      = () => ({ status: 'done', output: { video_url: 'https://cdn/lips.mp4', has_audio: true } });
  pollBehavior.compose_video = () => ({ status: 'done', output: { video_url: 'https://s3/final.mp4' } });
});

describe('advanceVideoJob', () => {
  it('produce el video siguiendo las dependencias y lo escribe en la pieza', async () => {
    const jobId = await newJob();

    // Vuelta 1: retrato → imagen del plano (misma vuelta) → animación encolada; voces listas.
    let snap = await advanceVideoJob(db.client, jobId);
    expect(step('char_ana').status).toBe('done');
    expect(step('img_s1').status).toBe('done');
    expect(step('voice_s1').status).toBe('done');
    expect(step('anim_s1').status).toBe('running');
    expect(step('lips_s1').status).toBe('pending');
    expect(step('compose').status).toBe('pending');
    // La imagen del plano recibió el retrato como referencia, ya resuelto.
    const imgRun = runs.find((r) => r.stepKey === 'img_s1')!;
    expect(imgRun.input.reference_image_urls).toEqual(['https://cdn/char_ana.jpg']);
    expect(snap!.status).toBe('running');

    // Vuelta 2: la animación termina → lipsync encolado con el clip y la voz.
    await advanceVideoJob(db.client, jobId);
    expect(step('anim_s1').status).toBe('done');
    expect(runs.find((r) => r.stepKey === 'lips_s1')!.input).toEqual({
      video_url: 'https://cdn/anim.mp4', audio_url: 'https://cdn/v.wav',
    });

    // Vuelta 3: lipsync listo → montaje con la línea de tiempo armada.
    await advanceVideoJob(db.client, jobId);
    const compose = runs.find((r) => r.tool === 'compose_video')!;
    const scenes = compose.input.scenes as Array<{ visual: { src?: string; has_audio?: boolean } }>;
    expect(scenes[0]!.visual).toMatchObject({ src: 'https://cdn/lips.mp4', has_audio: true });
    expect(scenes[1]!.visual).toMatchObject({ src: 'https://cdn/img_s2.jpg' });
    // Las fotos ya quedaron en la pieza (previews y portada).
    const item = db.find('kefy_content_items', (r) => r.id === 'item-1')!;
    expect((item.slides as Array<{ image_url: string }>)[1]!.image_url).toBe('https://cdn/img_s2.jpg');
    expect(item.image_url).toBe('https://cdn/img_s1.jpg');

    // Vuelta 4: el montaje termina.
    snap = await advanceVideoJob(db.client, jobId);
    expect(snap).toMatchObject({ status: 'done', progress: 1, video_url: 'https://s3/final.mp4' });
    expect(db.find('kefy_content_items', (r) => r.id === 'item-1')).toMatchObject({
      video_url: 'https://s3/final.mp4', render_status: 'ready',
    });

    // Se cobró cada paso una vez; el montaje venía cobrado de antes.
    // 3 imágenes: el retrato de Ana y una por plano.
    expect(creditsSpent()).toBe(3 * C.image + 2 * C.voice + C.animation + C.lipsync);
    expect(consumedCount(C.video)).toBe(0);
  });

  it('una animación que falla del todo devuelve sus créditos y el plano sale como foto', async () => {
    const jobId = await newJob();
    pollBehavior.animate_image = () => ({ status: 'failed', error: 'model error' });

    for (let i = 0; i < MAX_STEP_ATTEMPTS + 3; i++) await advanceVideoJob(db.client, jobId);

    expect(step('anim_s1')).toMatchObject({ status: 'failed', charged: false });
    expect(step('lips_s1')).toMatchObject({ status: 'skipped', error: 'dependency_failed' });
    expect(refundCount()).toBe(1);
    const compose = runs.find((r) => r.tool === 'compose_video')!;
    const scenes = compose.input.scenes as Array<{ visual: { type: string }; voice: unknown }>;
    expect(scenes[0]!.visual.type).toBe('image');
    // Sin lipsync, la línea del personaje va como voz aparte.
    expect(scenes[0]!.voice).toEqual({ src: 'https://cdn/v.wav' });
  });

  it('sin créditos para un paso, lo omite en vez de bloquear el video', async () => {
    const jobId = await newJob();
    quotaState.quotaAllowed = false;
    await advanceVideoJob(db.client, jobId);
    expect(step('img_s1')).toMatchObject({ status: 'skipped', error: 'credits_exhausted' });
    expect(step('anim_s1')).toMatchObject({ status: 'skipped' });
    // El montaje ya estaba pagado: sale igual, con el fondo de marca.
    expect(runs.some((r) => r.tool === 'compose_video')).toBe(true);
  });

  it('si el montaje falla del todo, el trabajo falla, se devuelven sus créditos y la pieza queda reintentable', async () => {
    const jobId = await newJob();
    behavior.compose_video = () => ({ status: 'failed', error: 'lambda down' });
    for (let i = 0; i < 6; i++) await advanceVideoJob(db.client, jobId);
    const snap = await advanceVideoJob(db.client, jobId);
    expect(snap).toMatchObject({ status: 'failed', error: 'lambda down' });
    expect(db.find('kefy_content_items', (r) => r.id === 'item-1')!.render_status).toBe('not_rendered');
    expect(step('compose').charged).toBe(false);
  });

  it('dos vueltas a la vez no lanzan dos veces el mismo paso', async () => {
    const jobId = await newJob();
    await Promise.all([advanceVideoJob(db.client, jobId), advanceVideoJob(db.client, jobId)]);
    expect(runs.filter((r) => r.stepKey === 'img_s1')).toHaveLength(1);
    expect(runs.filter((r) => r.stepKey === 'anim_s1')).toHaveLength(1);
  });

  it('una excepción de la herramienta se reintenta antes de darla por fallida', async () => {
    const jobId = await newJob();
    let calls = 0;
    behavior.text_to_speech = () => {
      calls += 1;
      if (calls === 1) throw new Error('openai 500');
      return { status: 'done', output: { audio_url: 'https://cdn/v.wav', duration_seconds: 1, words: [] } };
    };
    await advanceVideoJob(db.client, jobId);
    expect(step('voice_s1').status).toBe('done');
  });
});
