// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import {
  creditsSpent, quotaState, refundCount, resetQuotaState, resetSubscriptionState, subscriptionState,
} from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, seedSubscriptions, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai')>();
  return { ...actual, generateContentText: vi.fn() };
});
vi.mock('@/lib/zernio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/zernio')>();
  return { ...actual, replyToComment: vi.fn(), sendMessage: vi.fn(), disconnectAccount: vi.fn() };
});

import { generateContentText } from '@/lib/ai';
import { disconnectAccount, replyToComment, sendMessage } from '@/lib/zernio';
import { serviceContext } from '@/lib/services/context';
import {
  createEngagementRule, deleteEngagementRule, engagementRuleIssue, installEngagementPack, listEngagementPacks,
  listEngagementRules, updateEngagementRule,
} from '@/lib/services/engagement';
import { DEFAULT_LEAD_SCORING, getLeadScoringConfig, updateLeadScoringConfig } from '@/lib/services/lead-scoring';
import { deleteLead, listLeads, updateLead, upsertLead } from '@/lib/services/leads';
import { disconnectSocialAccount } from '@/lib/services/social';
import { executeEngagementRules, runDueEngagementJobs } from '@/lib/engagement-executor';
import { executeTool, getTool, registerTools } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { engagementTools } from '@/lib/assistant/tools/engagement';
import { chatToolContext } from '@/lib/assistant/context';
import type { ToolContext } from '@/lib/assistant/types';

// Engagement, leads y desconexión de cuentas: todo queda en la marca. Una
// regla de una marca no responde en las cuentas de otra, las antiguas sin
// marca responden en todas, y las herramientas solo aceptan reglas que el
// executor de verdad ejecuta.

const ACCOUNT = IDS.uuid(500);
const ACCOUNT_BRAND_2 = IDS.uuid(501);
const LEGACY_RULE = IDS.uuid(510);
const OTHER_ORG_RULE = IDS.uuid(511);
const LEAD = IDS.uuid(520);
const LEAD_BRAND_2 = IDS.uuid(521);

const ctx = (brandId: string = IDS.BRAND, scope: 'strict' | 'org' = 'strict') =>
  serviceContext(AUTH, brandId, 'es', { brandScope: scope, source: 'route' });

function chat(): ToolContext {
  return chatToolContext({
    auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: false,
  });
}

const RULE = {
  name: 'Gracias por comentar',
  trigger_type: 'new_comment',
  action_type: 'reply_comment',
  action_template: '¡Gracias por comentar!',
};

const commentEvent = (brandId: string | null, socialAccountId = ACCOUNT) => ({
  type: 'new_comment' as const,
  socialAccountId,
  brandId,
  zernioAccountId: 'z-1',
  commentId: 'c-1',
  postId: 'p-1',
  body: 'Me encanta el café',
  platform: 'instagram',
  authorId: 'a-1',
});

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  ensureToolsRegistered();
  if (!getTool('list_engagement_rules')) registerTools(engagementTools);
  db.seed('kefy_social_accounts', [
    { id: ACCOUNT, org_id: IDS.ORG, brand_id: IDS.BRAND, platform: 'instagram', zernio_account_id: 'z-1', status: 'active', username: 'cafe' },
    { id: ACCOUNT_BRAND_2, org_id: IDS.ORG, brand_id: IDS.BRAND_2, platform: 'instagram', zernio_account_id: 'z-2', status: 'active', username: 'bar' },
  ]);
  db.seed('kefy_brand_kits', [
    { id: IDS.uuid(530), org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Acme Café', tone: ['friendly'], tagline: 'Café de barrio', notes: null },
    { id: IDS.uuid(531), org_id: IDS.ORG, brand_id: IDS.BRAND_2, name: 'Acme Bar', tone: ['formal'], tagline: 'Bar de copas', notes: null },
  ]);
  db.seed('kefy_engagement_rules', [
    {
      id: LEGACY_RULE, org_id: IDS.ORG, brand_id: null, name: 'Antigua', trigger_type: 'new_follower',
      action_type: 'send_dm', action_template: 'Hola', condition_keyword: null, condition_platform: null,
      condition_rating: null, ai_context: null, delay_minutes: 15, is_active: true, created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: OTHER_ORG_RULE, org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, name: 'Ajena', trigger_type: 'new_comment',
      action_type: 'reply_comment', action_template: 'x', condition_keyword: null, condition_platform: null,
      condition_rating: null, ai_context: null, delay_minutes: 0, is_active: true, created_at: '2026-01-01T00:00:00Z',
    },
  ]);
  db.seed('kefy_leads', [
    { id: LEAD, org_id: IDS.ORG, brand_id: IDS.BRAND, username: 'ana', channel: 'instagram', stage: 'frio', score: 0, tags: [], notes: null, contacted: false, converted: false, last_interaction_at: '2026-09-02T00:00:00Z' },
    { id: LEAD_BRAND_2, org_id: IDS.ORG, brand_id: IDS.BRAND_2, username: 'beto', channel: 'instagram', stage: 'tibio', score: 10, tags: [], notes: null, contacted: false, converted: false, last_interaction_at: '2026-09-01T00:00:00Z' },
  ]);
});

describe('servicio de engagement', () => {
  it('crea la regla en la marca del contexto y lista las de la marca y las antiguas de toda la org', async () => {
    const rule = await createEngagementRule(ctx(), RULE);
    expect(rule).toMatchObject({ brand_id: IDS.BRAND, org_id: IDS.ORG, delay_minutes: 0, is_active: true });
    await createEngagementRule(ctx(IDS.BRAND_2), { ...RULE, name: 'Del bar' });

    const ids = (await listEngagementRules(ctx())).map((r) => r.id);
    expect(ids).toContain(rule.id);
    expect(ids).toContain(LEGACY_RULE);
    expect(ids).not.toContain(OTHER_ORG_RULE);
    expect(ids).toHaveLength(2);
  });

  it('valida la entrada con 422 y no toca reglas de otra organización', async () => {
    await expect(createEngagementRule(ctx(), { ...RULE, trigger_type: 'nope' })).rejects.toMatchObject({ code: 'invalid_input', status: 422 });
    await expect(updateEngagementRule(ctx(IDS.BRAND, 'org'), OTHER_ORG_RULE, { is_active: false })).rejects.toMatchObject({ status: 404 });
    await expect(deleteEngagementRule(ctx(IDS.BRAND, 'org'), OTHER_ORG_RULE)).rejects.toMatchObject({ status: 404 });
  });

  it('en modo strict una regla de otra marca es 404', async () => {
    const other = await createEngagementRule(ctx(IDS.BRAND_2), RULE);
    await expect(updateEngagementRule(ctx(), other.id, { is_active: false })).rejects.toMatchObject({ status: 404 });
    await expect(updateEngagementRule(ctx(IDS.BRAND, 'org'), other.id, { is_active: false })).resolves.toMatchObject({ is_active: false });
  });

  it('engagementRuleIssue explica por qué una regla no se ejecuta', () => {
    expect(engagementRuleIssue({ ...RULE, condition_keyword: null })).toBeNull();
    expect(engagementRuleIssue({ ...RULE, trigger_type: 'new_follower', condition_keyword: null })).toMatch(/never runs/);
    expect(engagementRuleIssue({ ...RULE, action_type: 'send_dm', condition_keyword: null })).toMatch(/DMs/);
    expect(engagementRuleIssue({ ...RULE, trigger_type: 'comment_contains_keyword', condition_keyword: null })).toMatch(/condition_keyword/);
    expect(engagementRuleIssue({ ...RULE, trigger_type: 'comment_contains_keyword', condition_keyword: null, trigger_config: { keywords: ['precio'] } })).toBeNull();
    expect(engagementRuleIssue({ ...RULE, action_template: '', condition_keyword: null })).toMatch(/action_template/);
  });

  it('no guarda reglas que no se ejecutan, pero deja pausar una antigua', async () => {
    await expect(createEngagementRule(ctx(), { ...RULE, trigger_type: 'new_follower' })).rejects.toMatchObject({ status: 422 });
    await expect(createEngagementRule(ctx(), { ...RULE, action_type: 'send_dm' })).rejects.toMatchObject({ status: 422 });
    await expect(updateEngagementRule(ctx(IDS.BRAND, 'org'), LEGACY_RULE, { is_active: false })).resolves.toMatchObject({ is_active: false });
    await expect(updateEngagementRule(ctx(IDS.BRAND, 'org'), LEGACY_RULE, { action_template: 'Hola!' })).rejects.toMatchObject({ status: 422 });
    await expect(updateEngagementRule(ctx(IDS.BRAND, 'org'), LEGACY_RULE, { trigger_type: 'new_dm' })).resolves.toMatchObject({ trigger_type: 'new_dm' });
  });

  it('acepta esperas', async () => {
    await expect(createEngagementRule(ctx(), { ...RULE, delay_minutes: 15 })).resolves.toMatchObject({ delay_minutes: 15 });
  });
});

describe('executor: cada regla responde solo en su marca', () => {
  it('una regla de una marca no responde en la cuenta de otra', async () => {
    await createEngagementRule(ctx(), RULE);
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND_2, ACCOUNT_BRAND_2));
    expect(replyToComment).not.toHaveBeenCalled();

    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', '¡Gracias por comentar!');
  });

  it('una regla antigua sin marca responde en todas', async () => {
    db.rows('kefy_engagement_rules').find((r) => r.id === LEGACY_RULE)!.trigger_type = 'new_comment';
    db.rows('kefy_engagement_rules').find((r) => r.id === LEGACY_RULE)!.action_type = 'reply_comment';
    db.rows('kefy_engagement_rules').find((r) => r.id === LEGACY_RULE)!.delay_minutes = 0;
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND_2, ACCOUNT_BRAND_2));
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', 'Hola');
  });

  it('la respuesta con IA usa el Brand Kit de la marca de la cuenta', async () => {
    vi.mocked(generateContentText).mockResolvedValue({ body: 'Respuesta', hashtags: [], model: 'claude', tokensUsed: 1 } as never);
    await createEngagementRule(ctx(IDS.BRAND_2), { ...RULE, action_type: 'reply_comment_ai', action_template: '' });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND_2, ACCOUNT_BRAND_2));
    expect(generateContentText).toHaveBeenCalledWith(expect.objectContaining({ brandName: 'Acme Bar', tagline: 'Bar de copas' }));
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', 'Respuesta');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('executor: las respuestas con IA pasan por la guardia de gasto', () => {
  const aiRule = () => createEngagementRule(ctx(), { ...RULE, action_type: 'reply_comment_ai', action_template: '' });

  it('cobra un crédito de texto por respuesta', async () => {
    vi.mocked(generateContentText).mockResolvedValue({ body: 'Respuesta', hashtags: [], model: 'claude', tokensUsed: 1 } as never);
    await aiRule();
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(creditsSpent()).toBe(1);
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', 'Respuesta');
  });

  it('con los créditos agotados no llama a la IA ni responde', async () => {
    quotaState.quotaAllowed = false;
    await aiRule();
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(generateContentText).not.toHaveBeenCalled();
    expect(replyToComment).not.toHaveBeenCalled();
  });

  it('con el trial vencido no llama a la IA', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);
    await aiRule();
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(generateContentText).not.toHaveBeenCalled();
    expect(creditsSpent()).toBe(0);
  });

  it('si la IA falla devuelve el crédito y no responde', async () => {
    vi.mocked(generateContentText).mockRejectedValue(new Error('anthropic down'));
    await aiRule();
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(refundCount()).toBe(1);
    expect(replyToComment).not.toHaveBeenCalled();
  });

  it('las respuestas con plantilla no gastan créditos', async () => {
    await createEngagementRule(ctx(), RULE);
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(creditsSpent()).toBe(0);
    expect(replyToComment).toHaveBeenCalled();
  });
});

describe('herramientas de engagement', () => {
  it('save_engagement_rule en el chat pide confirmación', async () => {
    const r = await executeTool('save_engagement_rule', RULE, chat());
    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(r.preview).toMatchObject({ name: 'Gracias por comentar', trigger: 'new_comment', action: 'reply_comment' });
  });

  it('exige scope publish para crearla', async () => {
    const r = await executeTool('save_engagement_rule', { ...RULE, brand_id: IDS.BRAND }, apiCtx({ scopes: ['read', 'write'] }));
    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied' } });
  });

  it('rechaza combinaciones que el executor no ejecuta', async () => {
    const r = await executeTool('save_engagement_rule', { ...RULE, action_type: 'send_dm', brand_id: IDS.BRAND }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    const noTemplate = await executeTool('save_engagement_rule', { ...RULE, action_template: undefined, brand_id: IDS.BRAND }, apiCtx());
    expect(noTemplate).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    const unsupported = await executeTool('save_engagement_rule', { ...RULE, trigger_type: 'new_follower', brand_id: IDS.BRAND }, apiCtx());
    expect(unsupported).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  });

  it('crea y lista la regla, y avisa de las antiguas que no se ejecutan', async () => {
    const created = await executeTool('save_engagement_rule', { ...RULE, brand_id: IDS.BRAND }, apiCtx());
    expect(created.ok).toBe(true);
    const listed = await executeTool('list_engagement_rules', { brand_id: IDS.BRAND }, apiCtx());
    expect(listed.ok).toBe(true);
    if (listed.ok !== true) return;
    const rules = (listed.data as { rules: Array<{ id: string; works: boolean; scope: string }> }).rules;
    expect(rules).toHaveLength(2);
    expect(rules.find((r) => r.id === LEGACY_RULE)).toMatchObject({ works: false, scope: 'organization' });
    expect(rules.find((r) => r.id !== LEGACY_RULE)).toMatchObject({ works: true, scope: 'brand' });
  });

  it('una key atada a una marca no edita ni borra reglas de toda la organización', async () => {
    const bound = apiCtx({ boundBrandId: IDS.BRAND });
    const upd = await executeTool('save_engagement_rule', { id: LEGACY_RULE, is_active: false }, bound);
    expect(upd).toMatchObject({ ok: false, error: { code: 'bound_key_org_write' } });
    const del = await executeTool('delete_engagement_rule', { rule_id: LEGACY_RULE }, bound);
    expect(del).toMatchObject({ ok: false, error: { code: 'bound_key_org_write' } });

    const unbound = await executeTool('save_engagement_rule', { id: LEGACY_RULE, is_active: false, brand_id: IDS.BRAND }, apiCtx());
    expect(unbound.ok).toBe(true);
  });

  it('un miembro no puede gestionar reglas', async () => {
    const r = await executeTool('delete_engagement_rule', { rule_id: LEGACY_RULE, brand_id: IDS.BRAND }, apiCtx({ role: 'member' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});

describe('leads', () => {
  it('lista solo los de la marca y no edita los de otra en modo strict', async () => {
    const { leads, total } = await listLeads(ctx());
    expect(total).toBe(1);
    expect(leads[0].id).toBe(LEAD);
    await expect(updateLead(ctx(), LEAD_BRAND_2, { stage: 'caliente' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteLead(ctx(), LEAD_BRAND_2)).rejects.toMatchObject({ status: 404 });
  });

  it('upsert crea en la marca y contacted pone la fecha', async () => {
    const lead = await upsertLead(ctx(), { username: 'carla', channel: 'tiktok', stage: 'tibio' });
    expect(lead).toMatchObject({ brand_id: IDS.BRAND, org_id: IDS.ORG, stage: 'tibio' });
    const updated = await updateLead(ctx(), lead.id, { contacted: true });
    expect(updated.contacted).toBe(true);
    expect(updated.contacted_at).toEqual(expect.any(String));
    await expect(updateLead(ctx(), lead.id, { stage: 'hirviendo' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('list_leads envuelve los datos de terceros y contamina el turno', async () => {
    const r = await executeTool('list_leads', { brand_id: IDS.BRAND }, apiCtx());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.tainted).toBe(true);
    const lead = (r.data as { leads: Array<{ username: string }> }).leads[0];
    expect(lead.username).toContain('<untrusted_content');
  });

  it('save_lead crea por usuario y red, y actualiza por id', async () => {
    const created = await executeTool('save_lead', { username: 'dani', channel: 'instagram', converted: true, brand_id: IDS.BRAND }, apiCtx());
    expect(created.ok).toBe(true);
    const row = db.rows('kefy_leads').find((l) => l.username === 'dani')!;
    expect(row).toMatchObject({ brand_id: IDS.BRAND, converted: true });

    const updated = await executeTool('save_lead', { id: LEAD, stage: 'caliente', brand_id: IDS.BRAND }, apiCtx());
    expect(updated.ok).toBe(true);
    expect(db.rows('kefy_leads').find((l) => l.id === LEAD)!.stage).toBe('caliente');
  });
});

describe('disconnect_social_account', () => {
  it('revoca en Zernio, borra la cuenta y la quita de las reglas de autopilot', async () => {
    db.seed('kefy_autopilot_rules', [
      { id: IDS.uuid(540), org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Tips', social_account_ids: [ACCOUNT, IDS.uuid(599)] },
    ]);
    db.seed('kefy_scheduled_posts', [
      { id: IDS.uuid(550), org_id: IDS.ORG, social_account_id: ACCOUNT, status: 'scheduled' },
    ]);
    const out = await disconnectSocialAccount(ctx(), ACCOUNT);
    expect(out).toMatchObject({ platform: 'instagram', username: 'cafe', scheduled_posts_removed: 1, autopilot_rules_updated: 1 });
    expect(disconnectAccount).toHaveBeenCalledWith('z-1');
    expect(db.rows('kefy_social_accounts').some((a) => a.id === ACCOUNT)).toBe(false);
    expect(db.rows('kefy_autopilot_rules')[0].social_account_ids).toEqual([IDS.uuid(599)]);
  });

  it('si Zernio falla, igual desconecta', async () => {
    vi.mocked(disconnectAccount).mockRejectedValueOnce(new Error('down'));
    await expect(disconnectSocialAccount(ctx(), ACCOUNT)).resolves.toMatchObject({ id: ACCOUNT });
  });

  it('en modo strict una cuenta de otra marca es 404', async () => {
    await expect(disconnectSocialAccount(ctx(), ACCOUNT_BRAND_2)).rejects.toMatchObject({ status: 404 });
  });

  it('la herramienta pide confirmación y muestra la cuenta', async () => {
    const r = await executeTool('disconnect_social_account', { account_id: ACCOUNT }, chat());
    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(r.preview).toMatchObject({ platform: 'instagram', username: 'cafe', scheduled_posts: 0 });
  });

  it('un miembro no puede desconectar', async () => {
    const r = await executeTool('disconnect_social_account', { account_id: ACCOUNT, brand_id: IDS.BRAND }, apiCtx({ role: 'member' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});

describe('executor: palabras clave y plataforma', () => {
  it('varias palabras separadas por comas: basta con una', async () => {
    await createEngagementRule(ctx(), { ...RULE, trigger_type: 'comment_contains_keyword', condition_keyword: 'precio, envío' });
    await executeEngagementRules(db.client as never, IDS.ORG, { ...commentEvent(IDS.BRAND), body: 'Hola, ¿hacen ENVÍO?' });
    expect(replyToComment).toHaveBeenCalledTimes(1);
    await executeEngagementRules(db.client as never, IDS.ORG, { ...commentEvent(IDS.BRAND), commentId: 'c-2', body: 'Lindo' });
    expect(replyToComment).toHaveBeenCalledTimes(1);
  });

  it("condition_platform 'all' de la UI antigua vale para todas las redes", async () => {
    const rule = await createEngagementRule(ctx(), RULE);
    db.rows('kefy_engagement_rules').find((r) => r.id === rule.id)!.condition_platform = 'all';
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(replyToComment).toHaveBeenCalled();
  });

  it('una regla antigua que responde un comentario por DM no hace nada ni suma el contador', async () => {
    const legacy = db.rows('kefy_engagement_rules').find((r) => r.id === LEGACY_RULE)!;
    legacy.trigger_type = 'new_comment';
    legacy.delay_minutes = 0;
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(legacy.times_triggered ?? 0).toBe(0);
  });
});

describe('executor: respuestas con espera', () => {
  const later = (min: number) => new Date(Date.now() + min * 60_000);

  it('encola, no responde antes de tiempo y responde al vencer', async () => {
    const rule = await createEngagementRule(ctx(), { ...RULE, delay_minutes: 15 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(replyToComment).not.toHaveBeenCalled();
    expect(db.rows('kefy_engagement_jobs')).toHaveLength(1);

    expect(await runDueEngagementJobs(db.client as never, { now: later(5) })).toEqual({ done: 0, skipped: 0, failed: 0 });
    expect(replyToComment).not.toHaveBeenCalled();

    expect(await runDueEngagementJobs(db.client as never, { now: later(16) })).toEqual({ done: 1, skipped: 0, failed: 0 });
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', '¡Gracias por comentar!');
    expect(db.rows('kefy_engagement_jobs')[0]).toMatchObject({ status: 'done', attempts: 1 });
    expect(db.rows('kefy_engagement_rules').find((r) => r.id === rule.id)!.times_triggered).toBe(1);

    // Ya hecho: otra pasada del cron no repite.
    await runDueEngagementJobs(db.client as never, { now: later(20) });
    expect(replyToComment).toHaveBeenCalledTimes(1);
  });

  it('el mismo evento repetido se encola una sola vez', async () => {
    await createEngagementRule(ctx(), { ...RULE, delay_minutes: 5 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(db.rows('kefy_engagement_jobs')).toHaveLength(1);
  });

  it('si pausaron la regla mientras esperaba, se salta', async () => {
    const rule = await createEngagementRule(ctx(), { ...RULE, delay_minutes: 5 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    await updateEngagementRule(ctx(), rule.id, { is_active: false });
    expect(await runDueEngagementJobs(db.client as never, { now: later(6) })).toMatchObject({ skipped: 1 });
    expect(replyToComment).not.toHaveBeenCalled();
  });

  it('una respuesta muy atrasada (cron caído) ya no se manda', async () => {
    await createEngagementRule(ctx(), { ...RULE, delay_minutes: 5 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(await runDueEngagementJobs(db.client as never, { now: later(60 * 7) })).toMatchObject({ skipped: 1 });
    expect(replyToComment).not.toHaveBeenCalled();
  });

  it('la IA se cobra al mandar, no al encolar', async () => {
    vi.mocked(generateContentText).mockResolvedValue({ body: 'Respuesta', hashtags: [], model: 'claude', tokensUsed: 1 } as never);
    await createEngagementRule(ctx(), { ...RULE, action_type: 'reply_comment_ai', action_template: '', delay_minutes: 5 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(creditsSpent()).toBe(0);
    await runDueEngagementJobs(db.client as never, { now: later(6) });
    expect(creditsSpent()).toBe(1);
    expect(replyToComment).toHaveBeenCalledWith('z-1', 'p-1', 'c-1', 'Respuesta');
  });
});

describe('executor: scoring de leads', () => {
  const lead = (username: string, brandId: string = IDS.BRAND) =>
    db.rows('kefy_leads').find((l) => l.username === username && l.brand_id === brandId);

  it('create_lead agrega al remitente con los puntos y la etapa de la regla', async () => {
    const rule = await createEngagementRule(ctx(), {
      ...RULE, lead_action_type: 'create_lead', lead_action_score_delta: 25, lead_action_stage: 'tibio',
    });
    await executeEngagementRules(db.client as never, IDS.ORG, { ...commentEvent(IDS.BRAND), authorName: 'Ana P.' });
    expect(lead('a-1')).toMatchObject({ channel: 'instagram', score: 25, stage: 'tibio', display_name: 'Ana P.', org_id: IDS.ORG });
    expect(db.rows('kefy_lead_interactions')[0]).toMatchObject({ type: 'comment', score_delta: 25, rule_id: rule.id, brand_id: IDS.BRAND });
  });

  it('con 0 puntos usa los de la configuración de la marca', async () => {
    db.seed('kefy_lead_scoring_config', [{ id: IDS.uuid(560), org_id: IDS.ORG, brand_id: IDS.BRAND, defaults: { comment: 7 }, thresholds: {} }]);
    await createEngagementRule(ctx(), { ...RULE, lead_action_type: 'create_lead' });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(lead('a-1')!.score).toBe(7);
  });

  it('sin regla de leads solo puntúa a quien ya es lead, y sube de etapa por umbral', async () => {
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(lead('a-1')).toBeUndefined();

    db.rows('kefy_leads').find((l) => l.id === LEAD)!.score = 48;
    await executeEngagementRules(db.client as never, IDS.ORG, { ...commentEvent(IDS.BRAND), commentId: 'c-9', authorId: 'ana' });
    expect(lead('ana')).toMatchObject({ score: 53, stage: 'caliente' });
  });

  it('update_lead no crea leads', async () => {
    await createEngagementRule(ctx(), { ...RULE, lead_action_type: 'update_lead', lead_action_score_delta: 10 });
    await executeEngagementRules(db.client as never, IDS.ORG, commentEvent(IDS.BRAND));
    expect(lead('a-1')).toBeUndefined();
  });

  it('un lead no baja de etapa solo', async () => {
    db.rows('kefy_leads').find((l) => l.id === LEAD)!.stage = 'contactado';
    await createEngagementRule(ctx(), { ...RULE, lead_action_type: 'update_lead', lead_action_score_delta: -5 });
    await executeEngagementRules(db.client as never, IDS.ORG, { ...commentEvent(IDS.BRAND), authorId: 'ana' });
    expect(lead('ana')).toMatchObject({ score: -5, stage: 'contactado' });
  });

  it('un DM puntúa como dm', async () => {
    await createEngagementRule(ctx(), { ...RULE, trigger_type: 'new_dm', action_type: 'send_dm', lead_action_type: 'create_lead' });
    await executeEngagementRules(db.client as never, IDS.ORG, {
      type: 'new_dm', socialAccountId: ACCOUNT, brandId: IDS.BRAND, zernioAccountId: 'z-1', threadId: 't-1',
      messageId: 'm-1', body: 'Hola', platform: 'instagram', senderId: 's-1',
    });
    expect(lead('s-1')!.score).toBe(15);
    expect(sendMessage).toHaveBeenCalledWith('z-1', 't-1', '¡Gracias por comentar!');
  });
});

describe('scoring de leads: configuración', () => {
  it('sin fila devuelve los valores por defecto', async () => {
    await expect(getLeadScoringConfig(ctx())).resolves.toEqual(DEFAULT_LEAD_SCORING);
  });

  it('cambia solo lo que viene, por marca, y rechaza umbrales desordenados', async () => {
    const out = await updateLeadScoringConfig(ctx(), { defaults: { dm: 30 }, thresholds: { tibio: 10 } });
    expect(out.defaults).toMatchObject({ dm: 30, comment: 5 });
    expect(out.thresholds).toMatchObject({ tibio: 10, caliente: 50 });
    expect(db.rows('kefy_lead_scoring_config')).toHaveLength(1);
    expect(db.rows('kefy_lead_scoring_config')[0]).toMatchObject({ brand_id: IDS.BRAND, org_id: IDS.ORG });
    await expect(getLeadScoringConfig(ctx(IDS.BRAND_2))).resolves.toEqual(DEFAULT_LEAD_SCORING);

    await expect(updateLeadScoringConfig(ctx(), { thresholds: { caliente: 5 } })).rejects.toMatchObject({ status: 422 });
    await expect(updateLeadScoringConfig(ctx(), { defaults: { comment: 'x' } })).rejects.toMatchObject({ status: 422 });
  });

  it('las herramientas leen y cambian el scoring', async () => {
    const upd = await executeTool('update_lead_scoring', { defaults: { comment: 9 }, brand_id: IDS.BRAND }, apiCtx());
    expect(upd.ok).toBe(true);
    const got = await executeTool('get_lead_scoring', { brand_id: IDS.BRAND }, apiCtx());
    expect(got.ok).toBe(true);
    if (got.ok !== true) return;
    expect((got.data as { config: { defaults: { comment: number } } }).config.defaults.comment).toBe(9);
    const member = await executeTool('update_lead_scoring', { defaults: { comment: 1 }, brand_id: IDS.BRAND }, apiCtx({ role: 'member' }));
    expect(member).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});

describe('packs de reglas', () => {
  const PACK = IDS.uuid(570);
  const EMPTY_PACK = IDS.uuid(571);

  beforeEach(() => {
    db.seed('kefy_automation_packs', [
      { id: PACK, objective_id: 'obj', name_es: 'Leads', name_en: 'Leads', sort_order: 1 },
      { id: EMPTY_PACK, objective_id: 'obj', name_es: 'Reseñas', name_en: 'Reviews', sort_order: 2 },
    ]);
    db.seed('kefy_automation_pack_rules', [
      {
        id: IDS.uuid(572), pack_id: PACK, name_es: 'Keyword', name_en: 'Keyword', trigger_type: 'comment_contains_keyword',
        trigger_config: { keywords: ['precio', 'info'] }, action_type: 'reply_comment_ai', action_config: {}, ai_context: 'CTA',
        delay_minutes: 0, lead_action_type: 'create_lead', lead_action_score_delta: 10, lead_action_stage: 'frio', sort_order: 1,
      },
      {
        id: IDS.uuid(573), pack_id: PACK, name_es: 'Sin respuesta', name_en: 'Unanswered', trigger_type: 'dm_no_response',
        trigger_config: {}, action_type: 'notify_team', action_config: {}, ai_context: null, delay_minutes: 0,
        lead_action_type: null, lead_action_score_delta: 0, lead_action_stage: null, sort_order: 2,
      },
      {
        id: IDS.uuid(574), pack_id: EMPTY_PACK, name_es: 'Seguidor', name_en: 'Follower', trigger_type: 'new_follower',
        trigger_config: {}, action_type: 'send_dm_ai_response', action_config: {}, ai_context: null, delay_minutes: 5,
        lead_action_type: null, lead_action_score_delta: 0, lead_action_stage: null, sort_order: 1,
      },
    ]);
  });

  it('solo ofrece las reglas que se ejecutan y oculta los packs sin ninguna', async () => {
    const packs = await listEngagementPacks(ctx(), 'obj');
    expect(packs.map((p) => p.id)).toEqual([PACK]);
    expect(packs[0].kefy_automation_pack_rules.map((r) => r.name_es)).toEqual(['Keyword']);
  });

  it('instala en la marca, con las palabras clave en condition_keyword, una sola vez', async () => {
    const out = await installEngagementPack(serviceContext(AUTH, IDS.BRAND, 'en', { brandScope: 'org', source: 'route' }), PACK);
    expect(out.inserted).toBe(1);
    expect(out.rules[0]).toMatchObject({
      brand_id: IDS.BRAND, name: 'Keyword', condition_keyword: 'precio, info', trigger_config: {},
      lead_action_type: 'create_lead', created_from: `pack:${PACK}`,
    });
    expect(engagementRuleIssue(out.rules[0])).toBeNull();

    const again = await installEngagementPack(ctx(), PACK);
    expect(again.inserted).toBe(0);
    await expect(installEngagementPack(ctx(), EMPTY_PACK)).rejects.toMatchObject({ status: 404 });
  });
});
