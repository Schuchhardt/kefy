import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { consumedCount, quotaState, resetQuotaState, resetSubscriptionState, subscriptionState } from '../helpers/quota';

// El pipeline de video visto desde las rutas que usa el reproductor:
// /api/content/reel/plan (cotizar), POST /render (producir, solo con
// confirmación) y GET /render (avance). Las herramientas no llegan a correr:
// la primera vuelta del motor tiene presupuesto 0.

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/subscription')>();
  const { fakeEntitlement } = await import('../helpers/quota');
  return { ...actual, getEntitlement: async () => fakeEntitlement() };
});

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

const { renderMediaOnLambda } = vi.hoisted(() => ({ renderMediaOnLambda: vi.fn() }));
vi.mock('@remotion/lambda/client', () => ({ renderMediaOnLambda, getRenderProgress: vi.fn() }));

import { getAuthFromRequest } from '@/lib/auth';
import { normalizeVideoScript, scriptToReelScenes } from '@/lib/video/script';
import { OPERATION_CREDIT_COSTS as C } from '@/lib/plans';

const auth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

const script = normalizeVideoScript({
  scenes: [
    { duration_seconds: 3, speaker: 'narrator', line: 'Mira esto', on_screen_text: 'Hook', visual: { kind: 'animated', image_prompt: 'a' } },
    { duration_seconds: 3, speaker: 'narrator', line: 'Síguenos', visual: { kind: 'still', image_prompt: 'b' } },
  ],
}, 'es');

function seedItem(patch: Record<string, unknown> = {}) {
  db.seed('kefy_content_items', [{
    id: 'item-1', org_id: 'org-1', brand_id: 'brand-1', content_type: 'reel', title: 'Hook', body: 'caption',
    hashtags: [], slides: scriptToReelScenes(script), metadata: { video_script: script },
    video_url: null, render_status: 'not_rendered', ...patch,
  }]);
  db.seed('kefy_brand_kits', [{ id: 'kit-1', brand_id: 'brand-1', name: 'Marca', accent_color: '#ff0000' }]);
}

function req(method: 'GET' | 'POST', path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3099${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
  Object.assign(process.env, VIDEO_ENV);
});

afterEach(() => { for (const k of Object.keys(VIDEO_ENV)) delete process.env[k]; });

/** Lo que el pipeline necesita configurado: fal, OpenAI y Remotion Lambda. */
const VIDEO_ENV = {
  FAL_KEY: 'test-key',
  OPENAI_API_KEY: 'sk-test',
  REMOTION_LAMBDA_FUNCTION_NAME: 'fn',
  REMOTION_SERVE_URL: 'https://serve.example.com',
};

describe('GET /api/content/reel/plan', () => {
  it('lista las herramientas del guion con su costo, sin gastar nada', async () => {
    seedItem();
    const { GET } = await import('@/app/api/content/reel/plan/route');
    const res = await GET(req('GET', '/api/content/reel/plan?itemId=item-1'));
    expect(res.status).toBe(200);
    const plan = await res.json();

    expect(plan.steps.map((s: { key: string }) => s.key)).toEqual(['img_s1', 'voice_s1', 'anim_s1', 'img_s2', 'voice_s2', 'compose']);
    expect(plan.credits).toBe(2 * C.image + 2 * C.voice + C.animation + C.video);
    expect(plan.credits_by_motion.none).toBe(plan.credits - C.animation);
    expect(plan.steps.find((s: { key: string }) => s.key === 'voice_s1').detail).toContain('Mira esto');
    expect(quotaState.calls.filter((c) => c.fn === 'kefy_credits_consume')).toHaveLength(0);
  });

  it('404 si la pieza es de otra organización', async () => {
    seedItem({ org_id: 'org-2' });
    const { GET } = await import('@/app/api/content/reel/plan/route');
    const res = await GET(req('GET', '/api/content/reel/plan?itemId=item-1'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/content/reel/render (reel con guion)', () => {
  it('sin confirmación no produce ni cobra: pide confirmar el plan', async () => {
    seedItem();
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1' }));
    expect(await res.json()).toMatchObject({ needs_confirmation: true, render_status: 'not_rendered' });
    expect(db.rows('kefy_video_jobs')).toHaveLength(0);
    expect(quotaState.calls.filter((c) => c.fn === 'kefy_credits_consume')).toHaveLength(0);
    expect(renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('con produce:true crea el trabajo, cobra el montaje y marca la pieza como en producción', async () => {
    seedItem();
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true, motion: 'none' }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.render_status).toBe('rendering');
    expect(body.production.motion).toBe('none');
    expect(body.production.steps.some((s: { tool: string }) => s.tool === 'animate_image')).toBe(false);

    expect(db.rows('kefy_video_jobs')).toHaveLength(1);
    expect(consumedCount(C.video)).toBe(1);
    const item = db.find('kefy_content_items', (r) => r.id === 'item-1')!;
    expect(item.render_status).toBe('rendering');
    expect((item.metadata as Record<string, unknown>).video_job_id).toBe(body.production.job_id);
  });

  it('si el plan no cabe en los créditos que quedan, no cobra nada', async () => {
    seedItem();
    db.seed('kefy_usage_counters', [{ org_id: 'org-1', period: new Date().toISOString().slice(0, 7), credits: 499 }]);
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ creditsExhausted: true, remaining: 1 });
    expect(quotaState.calls.filter((c) => c.fn === 'kefy_credits_consume')).toHaveLength(0);
  });

  it('sin suscripción activa responde 402 y no crea el trabajo', async () => {
    seedItem();
    subscriptionState.status = 'canceled';
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }));
    expect(res.status).toBe(402);
    expect(db.rows('kefy_video_jobs')).toHaveLength(0);
  });

  it('sin Remotion configurado no cobra nada: sin montaje no hay video', async () => {
    seedItem();
    delete process.env.REMOTION_SERVE_URL;
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }));
    expect(res.status).toBe(503);
    expect(quotaState.calls.filter((c) => c.fn === 'kefy_credits_consume')).toHaveLength(0);
    expect(db.rows('kefy_video_jobs')).toHaveLength(0);
  });

  it('reemplazar un video (force) conserva el anterior mientras se produce el nuevo', async () => {
    seedItem({ video_url: 'https://s3/old.mp4', render_status: 'ready' });
    const { POST } = await import('@/app/api/content/reel/render/route');
    const res = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true, force: true }));
    expect(res.status).toBe(202);
    expect(db.find('kefy_content_items', (r) => r.id === 'item-1')).toMatchObject({
      video_url: 'https://s3/old.mp4', render_status: 'rendering',
    });
  });

  it('si el guion cambió, la producción en curso se cancela y se produce el nuevo', async () => {
    seedItem();
    const { POST } = await import('@/app/api/content/reel/render/route');
    const first = await (await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }))).json();

    // El usuario edita la línea del primer plano mientras se produce.
    const item = db.find('kefy_content_items', (r) => r.id === 'item-1')!;
    (item.slides as Array<Record<string, unknown>>)[0]!.body = 'Una línea nueva';

    const second = await (await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }))).json();
    expect(second.production.job_id).not.toBe(first.production.job_id);
    expect(db.find('kefy_video_jobs', (r) => r.id === first.production.job_id)).toMatchObject({ status: 'canceled' });
    const meta = db.find('kefy_content_items', (r) => r.id === 'item-1')!.metadata as Record<string, unknown>;
    expect(meta.video_job_id).toBe(second.production.job_id);
    expect((meta.video_script as { scenes: Array<{ line: string }> }).scenes[0]!.line).toBe('Una línea nueva');
  });

  it('una segunda confirmación no duplica una producción en curso', async () => {
    seedItem();
    const { POST } = await import('@/app/api/content/reel/render/route');
    await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }));
    const again = await POST(req('POST', '/api/content/reel/render', { itemId: 'item-1', produce: true }));
    expect(again.status).toBe(202);
    expect(db.rows('kefy_video_jobs')).toHaveLength(1);
    expect(consumedCount(C.video)).toBe(1);
  });
});

describe('GET /api/content/reel/render (reel con guion)', () => {
  it('sin producción todavía, pide confirmar', async () => {
    seedItem();
    const { GET } = await import('@/app/api/content/reel/render/route');
    const res = await GET(req('GET', '/api/content/reel/render?itemId=item-1'));
    expect(await res.json()).toMatchObject({ render_status: 'not_rendered', needs_confirmation: true });
  });
});
