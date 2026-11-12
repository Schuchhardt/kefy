// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import {
  creditsSpent, refundCount, resetQuotaState, resetSubscriptionState,
} from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...actual,
    generateContentText: vi.fn(),
    generateContentImage: vi.fn(),
    generateCarouselSlides: vi.fn(),
    generateVideoScript: vi.fn(),
  };
});
vi.mock('@/lib/zernio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/zernio')>();
  return { ...actual, publishPost: vi.fn() };
});
// Los avisos por correo tienen su propio módulo: aquí solo importa que se pidan.
vi.mock('@/lib/autopilot-alerts', () => ({ sendAutopilotAlert: vi.fn(async () => true) }));
vi.mock('@/lib/storage', () => ({ uploadBase64Image: vi.fn(async (_b64: string, _org: string, name: string) => `https://kefy.test/${name}`) }));
// El ajuste de imagen por red descarga y procesa la imagen: aquí, la misma URL.
vi.mock('@/lib/publish-images', () => ({
  prepareSingleImage: vi.fn(async (url: string) => url),
  prepareCarouselSlides: vi.fn(async (slides: Array<{ image_url: string }>) => slides.map((s) => s.image_url)),
}));
// La producción del video tiene su propio test (engine/video-production): aquí
// solo deja la pieza «rendering», como hace produceVideo.
vi.mock('@/lib/services/video', () => ({
  produceVideo: vi.fn(async (_ctx: unknown, input: { itemId: string }) => {
    const row = db.rows('kefy_content_items').find((r) => r.id === input.itemId)!;
    row.render_status = 'rendering';
    row.metadata = { ...(row.metadata as object), video_job_id: 'job-1' };
    return {};
  }),
}));

import { generateCarouselSlides, generateContentImage, generateContentText, generateVideoScript } from '@/lib/ai';
import { publishPost } from '@/lib/zernio';
import { produceVideo } from '@/lib/services/video';
import { sendAutopilotAlert } from '@/lib/autopilot-alerts';
import { normalizeVideoScript } from '@/lib/video/script';
import { serviceContext } from '@/lib/services/context';
import {
  autopilotInputFromUiBody, createAutopilotRule, defaultAutopilotFormat, estimateAutopilotCredits,
  listAutopilotRules, parseAutopilotTopic, runAutopilotNow, runScheduledAutopilot, updateAutopilotRule,
  MAX_VIDEO_ATTEMPTS,
} from '@/lib/services/autopilot';
import { STORY_CONVERSION_CREDITS, estimateRunCredits } from '@/lib/autopilot-formats';
import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';
import type { ToolContext } from '@/lib/assistant/types';

// Autopilot: las reglas son de una marca (se crean con brand_id y solo con
// cuentas de esa marca), cada ejecución genera la pieza con su media (post con
// imagen, carrusel, reel en video) cobrando como la UI, y el contenido queda en
// la marca. Antes solo se programaba texto: TikTok/IG lo publicaban como una
// imagen con puro texto.

const ACCOUNT = IDS.uuid(500);
const ACCOUNT_BRAND_2 = IDS.uuid(501);
const TIKTOK = IDS.uuid(502);
const LINKEDIN = IDS.uuid(503);
const OTHER_RULE = IDS.uuid(510);

const ctx = (brandId: string = IDS.BRAND, scope: 'strict' | 'org' = 'strict') =>
  serviceContext(AUTH, brandId, 'es', { brandScope: scope, source: 'route' });

function chat(): ToolContext {
  return chatToolContext({
    auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false,
  });
}

const RULE = {
  name: 'Tips semanales',
  channel: 'instagram',
  social_account_ids: [ACCOUNT],
  frequency: 'weekly',
  day_of_week: 1,
  time_of_day: '10:00',
  timezone: 'America/Santiago',
  ai_model: 'claude',
  topic_hints: ['Cómo preparar un V60'],
};

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  ensureToolsRegistered();
  db.seed('kefy_social_accounts', [
    { id: ACCOUNT, org_id: IDS.ORG, brand_id: IDS.BRAND, platform: 'instagram', zernio_account_id: 'z-1', status: 'active', username: '@cafe' },
    { id: ACCOUNT_BRAND_2, org_id: IDS.ORG, brand_id: IDS.BRAND_2, platform: 'instagram', zernio_account_id: 'z-2', status: 'active', username: '@bar' },
    { id: TIKTOK, org_id: IDS.ORG, brand_id: IDS.BRAND, platform: 'tiktok', zernio_account_id: 'z-3', status: 'active', username: '@cafe' },
    { id: LINKEDIN, org_id: IDS.ORG, brand_id: IDS.BRAND, platform: 'linkedin', zernio_account_id: 'z-4', status: 'active', username: 'Café' },
  ]);
  db.seed('kefy_brand_kits', [
    { id: IDS.uuid(520), org_id: IDS.ORG, brand_id: IDS.BRAND, tone: ['friendly'], tagline: 'Café de barrio', notes: null },
    { id: IDS.uuid(521), org_id: IDS.ORG, brand_id: IDS.BRAND_2, tone: ['formal'], tagline: 'Bar de copas', notes: null },
  ]);
  db.seed('kefy_autopilot_rules', [{
    id: OTHER_RULE, org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, name: 'Ajena', channel: 'instagram',
    social_account_ids: [], frequency: 'weekly', day_of_week: 1, time_of_day: '09:00', timezone: 'UTC',
    ai_model: 'claude', tone: null, topic_hints: [], status: 'active', next_run_at: '2099-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  }]);
  vi.mocked(generateContentText).mockResolvedValue({ body: 'Post generado', hashtags: ['cafe'], model: 'x', tokensUsed: 1 });
  vi.mocked(generateContentImage).mockResolvedValue({ b64: 'aW1n', revisedPrompt: null } as never);
  vi.mocked(generateCarouselSlides).mockResolvedValue({
    slides: [1, 2, 3].map((n) => ({ slide_order: n, title: `T${n}`, body: `B${n}`, image_prompt: `p${n}` })),
    description: 'Carrusel', hashtags: ['cafe'], model: 'x', tokensUsed: 1,
  } as never);
  vi.mocked(generateVideoScript).mockResolvedValue(reelScript() as never);
  vi.mocked(publishPost).mockResolvedValue({ post_id: 'zp-1', platform_post_id: null } as never);
  // La imagen de origen no se descarga en los tests.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});

function reelScript() {
  return {
    script: normalizeVideoScript({
      title: 'Hook', hook: 'Hook', hashtags: ['#cafe'],
      scenes: [1, 2, 3].map((n) => ({
        duration_seconds: 3, speaker: 'narrator', line: `Línea ${n}`,
        visual: { kind: 'still', image_prompt: `prompt ${n}` },
      })),
    }, 'es'),
    model: 'claude',
    tokensUsed: 1,
  };
}

/** Deja la regla vencida, como la encuentra el cron. */
function makeDue(ruleId: string) {
  db.rows('kefy_autopilot_rules').find((r) => r.id === ruleId)!.next_run_at = '2026-01-01T00:00:00.000Z';
}

describe('reglas', () => {
  it('se crean en la marca del contexto, activas y con la próxima ejecución calculada', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    expect(rule).toMatchObject({ org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active', created_by: IDS.USER });
    expect(new Date(rule.next_run_at!).getTime()).toBeGreaterThan(Date.now());
    expect(await listAutopilotRules(ctx())).toHaveLength(1);
    expect(await listAutopilotRules(ctx(IDS.BRAND_2))).toHaveLength(0);
  });

  it('rechaza cuentas de otra marca', async () => {
    await expect(createAutopilotRule(ctx(), { ...RULE, social_account_ids: [ACCOUNT_BRAND_2] }))
      .rejects.toMatchObject({ status: 422 });
    expect(db.rows('kefy_autopilot_rules')).toHaveLength(1);
  });

  it('rechaza una zona horaria que no existe', async () => {
    await expect(createAutopilotRule(ctx(), { ...RULE, timezone: 'Marte/Olympus' }))
      .rejects.toMatchObject({ status: 422 });
  });

  it('la pista de tema de la UI (prompt_hint) llega a topic_hints', () => {
    expect(autopilotInputFromUiBody({ name: ' X ', prompt_hint: ' Recetas ', extra: 1 }))
      .toEqual({ name: 'X', topic_hints: ['Recetas'] });
  });

  it('la regla de otra org no se puede editar', async () => {
    await expect(updateAutopilotRule(ctx(IDS.BRAND, 'org'), OTHER_RULE, { status: 'paused' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('reanudar una regla pausada recalcula next_run_at', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!.next_run_at = '2020-01-01T00:00:00Z';
    await updateAutopilotRule(ctx(), rule.id, { status: 'paused' });
    const resumed = await updateAutopilotRule(ctx(), rule.id, { status: 'active' });
    expect(new Date(resumed.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('formato de cada ejecución', () => {
  it('la etiqueta del tema decide el formato y el tamaño', () => {
    expect(parseAutopilotTopic('[REEL 30s] El primer frame')).toEqual({ format: 'reel', topic: 'El primer frame', sceneCount: 6 });
    expect(parseAutopilotTopic('[CARRUSEL 8 slides] Framework')).toEqual({ format: 'carousel', topic: 'Framework', slideCount: 8 });
    expect(parseAutopilotTopic('[POST] Verdad incómoda')).toEqual({ format: 'post', topic: 'Verdad incómoda' });
    expect(parseAutopilotTopic('Sin etiqueta')).toEqual({ format: null, topic: 'Sin etiqueta' });
    expect(parseAutopilotTopic('[Ojo] no es formato')).toEqual({ format: null, topic: '[Ojo] no es formato' });
  });

  it('sin etiqueta: reel si todas las cuentas son de video, post con imagen si no', () => {
    expect(defaultAutopilotFormat(['tiktok'])).toBe('reel');
    expect(defaultAutopilotFormat(['tiktok', 'instagram'])).toBe('post');
    expect(defaultAutopilotFormat([])).toBe('post');
  });
});

describe('ejecutar ahora', () => {
  it('un post sale con su imagen, cobra texto + imagen y queda programado en la marca', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 1, failed: 0, results: [{ format: 'post' }] });
    expect(creditsSpent()).toBe(estimateAutopilotCredits('post'));
    expect(vi.mocked(generateContentText).mock.calls[0][0]).toMatchObject({ tagline: 'Café de barrio', topic: 'Cómo preparar un V60' });

    const item = db.rows('kefy_content_items')[0];
    expect(item).toMatchObject({ brand_id: IDS.BRAND, status: 'scheduled', image_status: 'ready' });
    expect(item.image_url).toMatch(/^https:\/\/kefy\.test\//);
    expect(item.metadata).toMatchObject({ autopilot: true, rule_id: rule.id, autopilot_format: 'post' });
    expect(vi.mocked(publishPost).mock.calls[0][0]).toMatchObject({ image_url: item.image_url, content_type: 'post' });
    expect(db.rows('kefy_scheduled_posts')[0]).toMatchObject({ brand_id: IDS.BRAND, social_account_id: ACCOUNT });
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ brand_id: IDS.BRAND, status: 'success' });
  });

  it('un carrusel sale con una imagen por slide', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, topic_hints: ['[CARRUSEL 3 slides] Métodos de filtrado'] });
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 1, results: [{ format: 'carousel' }] });
    expect(vi.mocked(generateCarouselSlides).mock.calls[0][0]).toMatchObject({ slide_count: 3, topic: 'Métodos de filtrado' });
    const payload = vi.mocked(publishPost).mock.calls[0][0];
    expect(payload.content_type).toBe('carousel');
    expect(payload.media_urls).toHaveLength(3);
  });

  it('si la imagen falla no se publica texto solo: la ejecución falla y devuelve la imagen', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    vi.mocked(generateContentImage).mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(refundCount()).toBe(1);
    expect(publishPost).not.toHaveBeenCalled();
    const item = db.rows('kefy_content_items')[0];
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed', content_item_id: item.id });
  });

  it('si la imagen se genera pero no queda en el contenido, no se publica texto solo', async () => {
    // Regresión: entre junio y septiembre de 2026 el autopilot publicó posts sin
    // imagen. Aunque el generador devuelva la imagen, se mira la fila guardada.
    const rule = await createAutopilotRule(ctx(), RULE);
    vi.mocked(generateContentImage).mockImplementationOnce(async () => {
      db.failNext('kefy_content_items', 'update'); // el enlace imagen → contenido
      return { b64: 'aW1n', revisedPrompt: null } as never;
    });
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(publishPost).not.toHaveBeenCalled();
    expect(db.rows('kefy_scheduled_posts')).toHaveLength(0);
    const item = db.rows('kefy_content_items')[0];
    expect(item.image_url ?? null).toBeNull();
    expect(item.status).not.toMatch(/approved|scheduled|published/);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed', content_item_id: item.id });
  });

  it('un carrusel con algún slide sin imagen no se publica', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, format: 'carousel' });
    vi.mocked(generateContentImage).mockResolvedValueOnce({ b64: 'aW1n', revisedPrompt: null } as never);
    vi.mocked(generateContentImage).mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(publishPost).not.toHaveBeenCalled();
  });

  it.each(['post', 'carousel', 'story'] as const)('todo %s del autopilot llega a la red con imagen', async (format) => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, format });
    await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(publishPost).toHaveBeenCalled();
    for (const [payload] of vi.mocked(publishPost).mock.calls) {
      const media = payload.media_urls?.length ? payload.media_urls : [payload.image_url];
      expect(media.length).toBeGreaterThan(0);
      for (const url of media) expect(url).toMatch(/^https:\/\//);
    }
  });

  it('si la generación falla devuelve el crédito', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    vi.mocked(generateContentText).mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');
    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(refundCount()).toBe(1);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
  });

  it('sin créditos para el formato no genera nada, responde 429 y no adelanta ni pausa la regla', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    db.seed('kefy_usage_counters', [{ org_id: IDS.ORG, period: new Date().toISOString().slice(0, 7), credits: 148 }]);
    await expect(runAutopilotNow(ctx(), [rule.id], 'test')).rejects.toMatchObject({ status: 429 });
    expect(generateContentText).not.toHaveBeenCalled();
    const after = db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!;
    expect(after.next_run_at).toBe(rule.next_run_at);
    // Quien pidió ejecutar ve el 429: pausarla es cosa del cron.
    expect(after.status).toBe('active');
  });

  it('no ejecuta reglas de otra org', async () => {
    const summary = await runAutopilotNow(ctx(IDS.BRAND, 'org'), [OTHER_RULE], 'test');
    expect(summary.results).toEqual([]);
    expect(generateContentText).not.toHaveBeenCalled();
  });
});

describe('reels', () => {
  it('una regla de TikTok sin etiqueta produce un reel y lo publica cuando el video está listo', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, social_account_ids: [TIKTOK], topic_hints: ['El primer frame'] });
    makeDue(rule.id);

    const first = await runScheduledAutopilot(null);
    expect(first.results).toMatchObject([{ status: 'success', format: 'reel', pending_video: true }]);
    expect(produceVideo).toHaveBeenCalledTimes(1);
    expect(publishPost).not.toHaveBeenCalled();
    const item = db.rows('kefy_content_items').find((r) => r.content_type === 'reel')!;
    expect(item.metadata).toMatchObject({ autopilot: true, autopilot_publish: { status: 'waiting', account_ids: [TIKTOK] } });

    // Mientras se produce, el cron no publica nada.
    expect((await runScheduledAutopilot(null)).results).toEqual([]);

    item.render_status = 'ready';
    item.video_url = 'https://kefy.test/reel.mp4';
    const second = await runScheduledAutopilot(null);
    expect(second.results).toMatchObject([{ status: 'success', format: 'reel', content_item_id: item.id }]);
    expect(vi.mocked(publishPost).mock.calls[0][0]).toMatchObject({
      platform: 'tiktok', video_url: 'https://kefy.test/reel.mp4', content_type: 'reel',
    });
    expect(item.metadata).toMatchObject({ autopilot_publish: { status: 'done' } });

    // Ya publicado, no se vuelve a publicar.
    await runScheduledAutopilot(null);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it('si la producción del video falla, la relanza una vez; si vuelve a fallar, queda fallida y avisa', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, social_account_ids: [TIKTOK], topic_hints: ['[REEL 20s] Tip'] });
    makeDue(rule.id);
    await runScheduledAutopilot(null);
    expect(produceVideo).toHaveBeenCalledTimes(1);

    const item = db.rows('kefy_content_items').find((r) => r.content_type === 'reel')!;
    // Primer fallo (el motor deja la pieza 'not_rendered'): se reintenta; los
    // créditos del intento fallido ya se devolvieron.
    item.render_status = 'not_rendered';
    const retry = await runScheduledAutopilot(null);
    expect(retry.results).toMatchObject([{ status: 'success', video_retry: true, content_item_id: item.id }]);
    expect(produceVideo).toHaveBeenCalledTimes(MAX_VIDEO_ATTEMPTS);
    expect(item.metadata).toMatchObject({ autopilot_publish: { status: 'waiting', attempts: 2 } });
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'success', video_status: 'producing', video_attempts: 2 });

    // Segundo fallo: no hay más intentos.
    item.render_status = 'not_rendered';
    const summary = await runScheduledAutopilot(null);
    expect(summary.results).toMatchObject([{ status: 'failed', content_item_id: item.id }]);
    expect(produceVideo).toHaveBeenCalledTimes(MAX_VIDEO_ATTEMPTS);
    expect(publishPost).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed', video_status: 'failed' });
    expect(sendAutopilotAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video_failed', ruleId: rule.id }));
  });

  it('list_autopilot_rules muestra la última ejecución con el estado del video', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, social_account_ids: [TIKTOK], format: 'reel' });
    makeDue(rule.id);
    await runScheduledAutopilot(null);

    const r = await executeTool('list_autopilot_rules', { brand_id: IDS.BRAND }, apiCtx());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const [view] = (r.data as { rules: Array<Record<string, unknown>> }).rules;
    expect(view).toMatchObject({
      format: 'reel',
      last_run: { status: 'success', format: 'reel', video: { status: 'producing', attempts: 1 } },
      cost: { per_run_max: estimateAutopilotCredits('reel') },
    });
  });
});

describe('cron', () => {
  it('cobra a la org y, si falla, adelanta la regla en vez de reintentar cada 5 minutos', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    makeDue(rule.id);
    vi.mocked(generateContentText).mockRejectedValueOnce(new Error('proveedor caído'));

    const summary = await runScheduledAutopilot(null);
    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(creditsSpent()).toBeGreaterThan(0);
    expect(refundCount()).toBe(1);

    const after = db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!;
    expect(new Date(after.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
    expect((await runScheduledAutopilot(null)).results).toEqual([]);
    expect(generateContentText).toHaveBeenCalledTimes(1);
  });

  it('sin saldo no genera nada y lo deja registrado', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    makeDue(rule.id);
    db.seed('kefy_usage_counters', [{ org_id: IDS.ORG, period: new Date().toISOString().slice(0, 7), credits: 150 }]);

    const summary = await runScheduledAutopilot(null);
    expect(summary).toMatchObject({ executed: 0, failed: 1, results: [{ paused: true }] });
    expect(generateContentText).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
    expect(String(db.rows('kefy_autopilot_runs')[0].error_message)).toContain('créditos');
    // En vez de fallar en cada hueco, la regla se pausa y se avisa.
    expect(db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)).toMatchObject({
      status: 'paused', paused_reason: 'credits_exhausted',
    });
    expect(sendAutopilotAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'paused_credits', ruleId: rule.id }));
  });

  it('sin cuentas activas no genera nada: se pausa y avisa en vez de fallar en cada hueco', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    makeDue(rule.id);
    db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!.social_account_ids = [];

    const summary = await runScheduledAutopilot(null);

    expect(summary).toMatchObject({ executed: 0, failed: 1, results: [{ paused: true }] });
    expect(generateContentText).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)).toMatchObject({
      status: 'paused', paused_reason: 'no_accounts',
    });
    expect(sendAutopilotAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'paused_no_accounts', ruleId: rule.id }));
  });

  it('una regla pausada por créditos se reanuda sola al empezar el mes siguiente; una pausada a mano, no', async () => {
    const byCredits = await createAutopilotRule(ctx(), RULE);
    const byHand = await createAutopilotRule(ctx(), { ...RULE, name: 'A mano' });
    await updateAutopilotRule(ctx(), byHand.id, { status: 'paused' });
    Object.assign(db.rows('kefy_autopilot_rules').find((r) => r.id === byCredits.id)!, {
      status: 'paused', paused_reason: 'credits_exhausted', paused_at: '2026-01-20T10:00:00.000Z', next_run_at: '2026-01-21T13:00:00.000Z',
    });

    const summary = await runScheduledAutopilot(null);
    expect(summary.resumed).toEqual([byCredits.id]);
    const resumed = db.rows('kefy_autopilot_rules').find((r) => r.id === byCredits.id)!;
    expect(resumed).toMatchObject({ status: 'active', paused_reason: null, paused_at: null });
    expect(new Date(resumed.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(db.rows('kefy_autopilot_rules').find((r) => r.id === byHand.id)).toMatchObject({ status: 'paused', paused_reason: null });
  });

  it('reanudarla a mano olvida el motivo de la pausa', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    Object.assign(db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!, {
      status: 'paused', paused_reason: 'credits_exhausted', paused_at: new Date().toISOString(),
    });
    const resumed = await updateAutopilotRule(ctx(), rule.id, { status: 'active' });
    expect(resumed).toMatchObject({ status: 'active', paused_reason: null, paused_at: null });
  });
});

describe('formato de la regla', () => {
  it('el formato de la regla manda sobre la etiqueta del tema', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, format: 'post', topic_hints: ['[REEL 30s] Tema'] });
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');
    expect(summary).toMatchObject({ executed: 1, results: [{ format: 'post', credits_estimated: 4 }] });
    expect(produceVideo).not.toHaveBeenCalled();
    expect(vi.mocked(generateContentText).mock.calls[0][0]).toMatchObject({ topic: 'Tema' });
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ format: 'post', credits_estimated: 4 });
  });

  it('una historia se genera vertical y solo se publica en las cuentas con Stories', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, format: 'story', social_account_ids: [ACCOUNT, LINKEDIN] });
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 1, results: [{ format: 'story' }] });
    expect(vi.mocked(generateContentImage).mock.calls[0][0]).toMatchObject({ size: '1024x1536' });
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishPost).mock.calls[0][0]).toMatchObject({ platform: 'instagram', content_type: 'story' });
    expect(db.rows('kefy_content_items')[0]).toMatchObject({ content_type: 'story', status: 'scheduled' });
  });

  it('no se puede guardar una regla con historias sin cuentas que las tengan', async () => {
    await expect(createAutopilotRule(ctx(), { ...RULE, social_account_ids: [LINKEDIN], format: 'story' }))
      .rejects.toMatchObject({ status: 422 });
    await expect(createAutopilotRule(ctx(), { ...RULE, social_account_ids: [TIKTOK], also_story: true }))
      .rejects.toMatchObject({ status: 422 });
  });

  it('la mezcla semanal solo vale para reglas diarias y con algún día que publique', async () => {
    await expect(createAutopilotRule(ctx(), { ...RULE, frequency: 'weekly', weekly_formats: { 4: 'reel' } }))
      .rejects.toMatchObject({ status: 422 });
    const allSkip = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, 'skip']));
    await expect(createAutopilotRule(ctx(), { ...RULE, frequency: 'daily', weekly_formats: allSkip }))
      .rejects.toMatchObject({ status: 422 });
  });

  it('post todos los días y reel los jueves: el formato sale del día del hueco, en la zona de la regla', async () => {
    const rule = await createAutopilotRule(ctx(), {
      ...RULE, frequency: 'daily', format: 'post', weekly_formats: { 4: 'reel' }, social_account_ids: [ACCOUNT],
    });
    const row = db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!;

    // Miércoles 2 de enero de 2030, 10:00 en Santiago (UTC-3): post.
    row.next_run_at = '2030-01-02T13:00:00.000Z';
    expect((await runAutopilotNow(ctx(), [rule.id], 'test')).results).toMatchObject([{ format: 'post' }]);

    // Jueves 3 de enero, 10:00 en Santiago: reel.
    row.next_run_at = '2030-01-03T13:00:00.000Z';
    expect((await runAutopilotNow(ctx(), [rule.id], 'test')).results).toMatchObject([{ format: 'reel', pending_video: true }]);
    expect(produceVideo).toHaveBeenCalledTimes(1);
  });
});

describe('historia derivada (also_story)', () => {
  it('tras programar el post, convierte la pieza a historia y la programa 2 horas después en las cuentas con Stories', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, also_story: true, social_account_ids: [ACCOUNT, LINKEDIN] });
    const slot = db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!.next_run_at as string;
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary.results[0]).toMatchObject({
      format: 'post', credits_estimated: estimateRunCredits('post', { alsoStory: true }), story: { status: 'scheduled' },
    });
    expect(creditsSpent()).toBe(estimateAutopilotCredits('post') + STORY_CONVERSION_CREDITS);

    const calls = vi.mocked(publishPost).mock.calls.map((c) => c[0]);
    expect(calls.filter((p) => p.content_type === 'post').map((p) => p.platform).sort()).toEqual(['instagram', 'linkedin']);
    const story = calls.filter((p) => p.content_type === 'story');
    expect(story).toHaveLength(1);
    expect(story[0]).toMatchObject({ platform: 'instagram' });
    expect(new Date(story[0].scheduled_at!).getTime()).toBe(new Date(slot).getTime() + 120 * 60_000);

    expect(db.rows('kefy_content_renditions')).toMatchObject([{ format: 'story', status: 'ready' }]);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'success', story_status: 'scheduled' });
    expect((db.rows('kefy_autopilot_runs')[0].story_scheduled_post_ids as string[]).length).toBe(1);
  });

  it('si la historia falla, el post sigue publicado y el fallo queda en la ejecución', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, also_story: true, story_delay_minutes: 30 });
    // Texto del post y de la historia bien; la imagen de la historia falla.
    vi.mocked(generateContentImage)
      .mockResolvedValueOnce({ b64: 'aW1n', revisedPrompt: null } as never)
      .mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 1, results: [{ status: 'success', story: { status: 'failed' } }] });
    expect(vi.mocked(publishPost).mock.calls.map((c) => c[0].content_type)).toEqual(['post']);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'success', story_status: 'failed' });
  });

  it('en un reel, la historia sale cuando el video se publica', async () => {
    const rule = await createAutopilotRule(ctx(), {
      ...RULE, format: 'reel', also_story: true, social_account_ids: [ACCOUNT, TIKTOK],
    });
    makeDue(rule.id);
    await runScheduledAutopilot(null);
    expect(publishPost).not.toHaveBeenCalled();

    const item = db.rows('kefy_content_items').find((r) => r.content_type === 'reel')!;
    item.render_status = 'ready';
    item.video_url = 'https://kefy.test/reel.mp4';
    const summary = await runScheduledAutopilot(null);

    // El hueco ya pasó: el reel sale ahora y su historia, 2 horas después.
    expect(summary.results[0]).toMatchObject({ status: 'success', format: 'reel', story: { status: 'scheduled' } });
    const types = vi.mocked(publishPost).mock.calls.map((c) => `${c[0].content_type}:${c[0].platform}`).sort();
    expect(types).toEqual(['reel:instagram', 'reel:tiktok', 'story:instagram']);
    const story = vi.mocked(publishPost).mock.calls.find((c) => c[0].content_type === 'story')![0];
    expect(new Date(story.scheduled_at!).getTime() - Date.now()).toBeGreaterThan(119 * 60_000);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ video_status: 'published', story_status: 'scheduled' });
  });
});

describe('herramientas del asistente', () => {
  it('save_autopilot_rule en el chat pide confirmación y no crea nada todavía', async () => {
    const r = await executeTool('save_autopilot_rule', RULE, chat());
    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(r.summary).toContain('Tips semanales');
    expect(r.preview).toMatchObject({ name: 'Tips semanales', frequency: 'weekly', accounts: 1 });
    expect(db.rows('kefy_autopilot_rules')).toHaveLength(1);
  });

  it('una API key sin scope publish no puede crear reglas', async () => {
    const r = await executeTool('save_autopilot_rule', { ...RULE, brand_id: IDS.BRAND }, apiCtx({ scopes: ['read', 'write'] }));
    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied' } });
  });

  it('con scope publish la crea en la marca pedida y la lista', async () => {
    const created = await executeTool('save_autopilot_rule', { ...RULE, brand_id: IDS.BRAND }, apiCtx());
    expect(created.ok).toBe(true);
    const listed = await executeTool('list_autopilot_rules', { brand_id: IDS.BRAND }, apiCtx());
    expect(listed.ok).toBe(true);
    if (listed.ok !== true) return;
    expect((listed.data as { rules: unknown[] }).rules).toHaveLength(1);
  });

  it('un miembro no gestiona el autopilot', async () => {
    const r = await executeTool('run_autopilot_now', { rule_ids: [OTHER_RULE], brand_id: IDS.BRAND }, apiCtx({ role: 'member' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('save_autopilot_rule por MCP acepta formato, mezcla semanal e historia derivada', async () => {
    const r = await executeTool('save_autopilot_rule', {
      ...RULE, brand_id: IDS.BRAND, frequency: 'daily', format: 'post', weekly_formats: { 4: 'reel' },
      also_story: true, story_delay_minutes: 90,
    }, { ...apiCtx(), source: 'mcp' });
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect((r.data as { rule: Record<string, unknown> }).rule).toMatchObject({
      format: 'post', weekly_formats: { 4: 'reel' }, also_story: true, story_delay_minutes: 90,
      cost: { per_run_min: 8, per_run_max: estimateRunCredits('reel', { alsoStory: true }) },
    });
  });

  it('la tarjeta de confirmación anuncia el formato, la mezcla y el costo por ejecución y al mes', async () => {
    const r = await executeTool('save_autopilot_rule', {
      ...RULE, frequency: 'daily', format: 'post', weekly_formats: { 4: 'reel' },
    }, chat());
    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(r.preview).toMatchObject({
      format: 'Post con imagen', weekly_formats: 'Jue: Reel', credits_per_run: `4–${estimateAutopilotCredits('reel')}`,
    });
    expect(r.preview.credits_per_month).toBeGreaterThan(300);
  });

  it('run_autopilot_now en el chat anuncia el coste en créditos', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    const r = await executeTool('run_autopilot_now', { rule_ids: [rule.id] }, chat());
    expect(r).toMatchObject({ ok: 'pending', credits: estimateAutopilotCredits('post') });
    expect(generateContentText).not.toHaveBeenCalled();
  });
});

describe('get_connect_account_link', () => {
  it('desde el chat devuelve el link relativo a Ajustes con la red y la marca', async () => {
    const r = await executeTool('get_connect_account_link', { platform: 'tiktok' }, chat());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const href = `/es/dashboard/settings?connect=tiktok&brand=${IDS.BRAND}`;
    expect(r.data).toMatchObject({ platform: 'tiktok', url: href, requires_login: true });
    expect((r.data as { already_connected: Array<{ id: string }> }).already_connected.map((a) => a.id)).toEqual([TIKTOK]);
    expect(r.links?.[0]).toEqual({ label: 'Conectar TikTok', href });
  });

  it('por la API el link es absoluto y lista las cuentas de esa red que ya hay', async () => {
    const r = await executeTool('get_connect_account_link', { platform: 'instagram', brand_id: IDS.BRAND }, apiCtx());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const data = r.data as { url: string; already_connected: Array<{ id: string }> };
    expect(data.url).toMatch(new RegExp(`^https?://[^/]+/en/dashboard/settings\\?connect=instagram&brand=${IDS.BRAND}$`));
    expect(data.already_connected.map((a) => a.id)).toEqual([ACCOUNT]);
  });

  it('una red que no se puede conectar da 422', async () => {
    const r = await executeTool('get_connect_account_link', { platform: 'myspace', brand_id: IDS.BRAND }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { status: 422 } });
  });
});
