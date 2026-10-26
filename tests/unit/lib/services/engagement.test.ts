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
  createEngagementRule, deleteEngagementRule, engagementRuleIssue, listEngagementRules, updateEngagementRule,
} from '@/lib/services/engagement';
import { deleteLead, listLeads, updateLead, upsertLead } from '@/lib/services/leads';
import { disconnectSocialAccount } from '@/lib/services/social';
import { executeEngagementRules } from '@/lib/engagement-executor';
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
    expect(engagementRuleIssue({ ...RULE, condition_keyword: null, delay_minutes: 0 })).toBeNull();
    expect(engagementRuleIssue({ ...RULE, trigger_type: 'new_follower', condition_keyword: null, delay_minutes: 0 })).toMatch(/not executed/);
    expect(engagementRuleIssue({ ...RULE, condition_keyword: null, delay_minutes: 5 })).toMatch(/delay/);
    expect(engagementRuleIssue({ ...RULE, action_type: 'send_dm', condition_keyword: null, delay_minutes: 0 })).toMatch(/DMs/);
    expect(engagementRuleIssue({ ...RULE, trigger_type: 'comment_contains_keyword', condition_keyword: null, delay_minutes: 0 })).toMatch(/condition_keyword/);
    expect(engagementRuleIssue({ ...RULE, action_template: '', condition_keyword: null, delay_minutes: 0 })).toMatch(/action_template/);
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
