// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import {
  creditsSpent, quotaState, refundCount, resetQuotaState, resetSubscriptionState,
} from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return { ...actual, generateContentText: vi.fn() };
});
vi.mock('@/lib/zernio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/zernio')>();
  return { ...actual, publishPost: vi.fn() };
});

import { generateContentText } from '@/lib/ai';
import { publishPost } from '@/lib/zernio';
import { serviceContext } from '@/lib/services/context';
import {
  autopilotInputFromUiBody, createAutopilotRule, listAutopilotRules, runAutopilotNow, updateAutopilotRule,
} from '@/lib/services/autopilot';
import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';
import type { ToolContext } from '@/lib/assistant/types';

// Autopilot: las reglas son de una marca (se crean con brand_id y solo con
// cuentas de esa marca), una ejecución pedida por una persona cobra 1 crédito
// por regla y lo devuelve si falla, y el contenido generado queda en la marca.

const ACCOUNT = IDS.uuid(500);
const ACCOUNT_BRAND_2 = IDS.uuid(501);
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
  ]);
  db.seed('kefy_brand_kits', [
    { id: IDS.uuid(520), org_id: IDS.ORG, brand_id: IDS.BRAND, tone: ['friendly'], tagline: 'Café de barrio', notes: null },
    { id: IDS.uuid(521), org_id: IDS.ORG, brand_id: IDS.BRAND_2, tone: ['formal'], tagline: 'Bar de copas', notes: null },
  ]);
  db.seed('kefy_autopilot_rules', [{
    id: OTHER_RULE, org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, name: 'Ajena', channel: 'instagram',
    social_account_ids: [], frequency: 'weekly', day_of_week: 1, time_of_day: '09:00', timezone: 'UTC',
    ai_model: 'claude', tone: null, topic_hints: [], status: 'active', next_run_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  }]);
  vi.mocked(generateContentText).mockResolvedValue({ body: 'Post generado', hashtags: ['cafe'], model: 'x', tokensUsed: 1 });
  vi.mocked(publishPost).mockResolvedValue({ post_id: 'zp-1', platform_post_id: null } as never);
});

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

describe('ejecutar ahora', () => {
  it('cobra 1 crédito, genera con el kit de la marca y deja el contenido y los posts en la marca', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');

    expect(summary).toMatchObject({ executed: 1, failed: 0 });
    expect(creditsSpent()).toBe(1);
    expect(vi.mocked(generateContentText).mock.calls[0][0]).toMatchObject({ tagline: 'Café de barrio', topic: 'Cómo preparar un V60' });

    const item = db.rows('kefy_content_items')[0];
    expect(item).toMatchObject({ brand_id: IDS.BRAND, status: 'scheduled' });
    expect(db.rows('kefy_scheduled_posts')[0]).toMatchObject({ brand_id: IDS.BRAND, social_account_id: ACCOUNT });
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ brand_id: IDS.BRAND, status: 'success' });
  });

  it('si la generación falla devuelve el crédito', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    vi.mocked(generateContentText).mockRejectedValueOnce(new Error('proveedor caído'));
    const summary = await runAutopilotNow(ctx(), [rule.id], 'test');
    expect(summary).toMatchObject({ executed: 0, failed: 1 });
    expect(refundCount()).toBe(1);
    expect(db.rows('kefy_autopilot_runs')[0]).toMatchObject({ status: 'failed' });
  });

  it('sin créditos no genera nada y responde 429', async () => {
    const rule = await createAutopilotRule(ctx(), RULE);
    quotaState.quotaAllowed = false;
    await expect(runAutopilotNow(ctx(), [rule.id], 'test')).rejects.toMatchObject({ status: 429 });
    expect(generateContentText).not.toHaveBeenCalled();
  });

  it('no ejecuta reglas de otra org', async () => {
    const summary = await runAutopilotNow(ctx(IDS.BRAND, 'org'), [OTHER_RULE], 'test');
    expect(summary.results).toEqual([]);
    expect(generateContentText).not.toHaveBeenCalled();
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
    expect(r).toMatchObject({ ok: 'pending', credits: 1 });
    expect(generateContentText).not.toHaveBeenCalled();
  });
});

describe('get_connect_account_link', () => {
  it('desde el chat devuelve el link relativo a Ajustes con la red y la marca', async () => {
    const r = await executeTool('get_connect_account_link', { platform: 'tiktok' }, chat());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const href = `/es/dashboard/settings?connect=tiktok&brand=${IDS.BRAND}`;
    expect(r.data).toMatchObject({ platform: 'tiktok', url: href, requires_login: true, already_connected: [] });
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
