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
import { normalizeVideoScript } from '@/lib/video/script';
import { serviceContext } from '@/lib/services/context';
import {
  autopilotInputFromUiBody, createAutopilotRule, defaultAutopilotFormat, estimateAutopilotCredits,
  listAutopilotRules, parseAutopilotTopic, runAutopilotNow, runScheduledAutopilot, updateAutopilotRule,
} from '@/lib/services/autopilot';
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

  it('si la generación falla devuelve el crédito', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    vi.mocked(generateContentText).mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');
    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(refundCount()).toBe(1);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
  });

  it('sin créditos para el formato no genera nada, responde 429 y no adelanta la regla', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    db.seed('kefy_usage_counters', [{ org_id: IDS.ORG, period: new Date().toISOString().slice(0, 7), credits: 148 }]);
    await expect(runAutopilotNow(ctx(), [rule.id], 'test')).rejects.toMatchObject({ status: 429 });
    expect(generateContentText).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_rules').find((r) => r.id === rule.id)!.next_run_at).toBe(rule.next_run_at);
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

  it('si la producción del video falla, la ejecución queda fallida y no se publica nada', async () => {
    const rule = await createAutopilotRule(ctx(), { ...RULE, social_account_ids: [TIKTOK], topic_hints: ['[REEL 20s] Tip'] });
    makeDue(rule.id);
    await runScheduledAutopilot(null);

    const item = db.rows('kefy_content_items').find((r) => r.content_type === 'reel')!;
    item.render_status = 'not_rendered';
    const summary = await runScheduledAutopilot(null);

    expect(summary.results).toMatchObject([{ status: 'failed', content_item_id: item.id }]);
    expect(publishPost).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
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
    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(generateContentText).not.toHaveBeenCalled();
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
    expect(String(db.rows('kefy_autopilot_runs')[0].error_message)).toContain('créditos');
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
