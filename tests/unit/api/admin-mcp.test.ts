// @vitest-environment node
//
// MCP de administración (/api/admin/mcp): OAuth con scope 'admin' +
// KEFY_ADMIN_EMAILS, aislamiento respecto de /api/mcp, confirmación en el
// servidor de las escrituras delicadas y auditoría. Ver docs/admin-mcp.md.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../helpers/quota';
import { IDS, AUTH, seedWorkspace } from '../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

import { POST as register } from '@/app/api/oauth/register/route';
import { GET as consentGet, POST as consentPost } from '@/app/api/oauth/consent/route';
import { POST as token } from '@/app/api/oauth/token/route';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { POST as adminPost } from '@/app/api/admin/mcp/route';
import { GET as adminMetadata } from '@/app/.well-known/oauth-protected-resource/api/admin/mcp/route';
import { getAuthFromRequest } from '@/lib/auth';
import { adminEmails } from '@/lib/admin/auth';
import type { JWTPayload } from '@/types/auth';

const BASE = 'http://localhost:3099';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(50);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const ADMIN_RESOURCE = `${BASE}/api/admin/mcp`;

function as(auth: JWTPayload | null) {
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

function query(clientId: string, resource: string) {
  return new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: CHALLENGE,
    code_challenge_method: 'S256', state: 's', resource,
  }).toString();
}

async function connect(resource = ADMIN_RESOURCE, scopes: string[] = ['read']) {
  const client = await (await register(postJson('/api/oauth/register', {
    client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none',
  }))).json();
  const decision = await consentPost(postJson('/api/oauth/consent', {
    query: query(client.client_id, resource), decision: 'approve', scopes,
  }, { origin: BASE }));
  const body = await decision.json();
  if (!body.redirect) return { decision: body, status: decision.status, access: null as string | null, scope: null };
  const code = new URL(body.redirect).searchParams.get('code')!;
  const res = await token(new NextRequest(`${BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: REDIRECT,
      code_verifier: VERIFIER, resource,
    }).toString(),
  }));
  const tokens = await res.json();
  return { decision: body, status: decision.status, access: tokens.access_token as string, scope: tokens.scope as string };
}

let rpcId = 0;
async function call(handler: typeof adminPost, accessToken: string | null, method: string, params?: unknown) {
  const res = await handler(new NextRequest(`${BASE}/api/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  }));
  return { res, body: res.status === 202 ? null : await res.json() };
}

const tool = async (accessToken: string, name: string, args: Record<string, unknown> = {}) => {
  const { body } = await call(adminPost, accessToken, 'tools/call', { name, arguments: args });
  return body.result as { isError: boolean; structuredContent: Record<string, any>; content: { text: string }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  seedWorkspace(db);
  db.seed('kefy_users', [
    { id: IDS.USER, email: 'Boss@Kefy.app', name: 'Boss' },
    { id: IDS.USER_2, email: 'member@acme.cl', name: 'Member' },
    { id: IDS.OTHER_USER, email: 'owner@otra.cl', name: 'Otra Owner' },
  ]);
  vi.stubEnv('KEFY_ADMIN_EMAILS', 'boss@kefy.app, other@kefy.app');
  vi.stubEnv('JWT_SECRET', 'test-secret-for-admin-confirmations');
  for (const k of ['SENTRY_API_TOKEN', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) vi.stubEnv(k, '');
  as(AUTH);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('adminEmails', () => {
  it('lee la lista separada por comas, en minúsculas; sin variable no hay admins', () => {
    expect([...adminEmails(' A@x.com,b@y.cl ;c@z.io ')]).toEqual(['a@x.com', 'b@y.cl', 'c@z.io']);
    expect(adminEmails('').size).toBe(0);
    expect(adminEmails('no-es-email').size).toBe(0);
  });
});

describe('OAuth del MCP de administración', () => {
  it('los metadatos del recurso admin anuncian solo el scope admin', async () => {
    const body = await adminMetadata(new NextRequest(`${BASE}/.well-known/oauth-protected-resource/api/admin/mcp`)).json();
    expect(body).toMatchObject({ resource: ADMIN_RESOURCE, scopes_supported: ['admin'], authorization_servers: [BASE] });
  });

  it('el 401 lleva a los metadatos del recurso admin', async () => {
    const { res } = await call(adminPost, null, 'ping');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('/.well-known/oauth-protected-resource/api/admin/mcp');
  });

  it('el consentimiento sabe que es admin y solo deja autorizar a un email de la lista', async () => {
    const client = await (await register(postJson('/api/oauth/register', { redirect_uris: [REDIRECT] }))).json();
    const res = await consentGet(new NextRequest(`${BASE}/api/oauth/consent?${query(client.client_id, ADMIN_RESOURCE)}`));
    expect(await res.json()).toMatchObject({ admin: true, can_authorize: true, brands: [], default_scopes: [] });

    as({ ...AUTH, userId: IDS.USER_2, role: 'member' });
    const res2 = await consentGet(new NextRequest(`${BASE}/api/oauth/consent?${query(client.client_id, ADMIN_RESOURCE)}`));
    expect(await res2.json()).toMatchObject({ admin: true, can_authorize: false });
  });

  it('un admin obtiene una conexión con solo el scope admin, aunque pida otros', async () => {
    const c = await connect(ADMIN_RESOURCE, ['read', 'write', 'publish']);
    expect(c.scope).toBe('admin');
    const key = db.rows('kefy_api_keys')[0];
    expect(key.scopes).toEqual(['admin']);
    expect(key.brand_id).toBeNull();

    const { body } = await call(adminPost, c.access, 'tools/list');
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'get_platform_overview', 'get_organization', 'list_recent_failures', 'list_sentry_issues', 'get_runtime_logs',
      'list_sales_leads', 'upsert_outreach_leads', 'find_account_lead_candidates', 'extend_trial',
    ]));
  });

  it('quien no está en KEFY_ADMIN_EMAILS no obtiene la conexión', async () => {
    as({ ...AUTH, userId: IDS.USER_2, role: 'member' });
    const c = await connect();
    expect(c.status).toBe(403);
    expect(c.decision.code).toBe('admin_forbidden');
    expect(db.rows('kefy_oauth_codes')).toHaveLength(0);
  });

  it('quitar el email de la variable corta el acceso en la siguiente petición', async () => {
    const c = await connect();
    expect((await call(adminPost, c.access, 'ping')).res.status).toBe(200);
    vi.stubEnv('KEFY_ADMIN_EMAILS', 'other@kefy.app');
    const { res } = await call(adminPost, c.access, 'ping');
    expect(res.status).toBe(403);
  });

  it('una conexión normal no entra al admin y la admin no puede nada en /api/mcp', async () => {
    const normal = await connect(`${BASE}/api/mcp`, ['read', 'write']);
    expect(normal.scope).toBe('read write');
    const denied = await call(adminPost, normal.access, 'ping');
    expect(denied.res.status).toBe(403);
    expect(denied.res.headers.get('WWW-Authenticate')).toContain('insufficient_scope');

    const admin = await connect();
    const { body } = await call(mcpPost, admin.access, 'tools/list');
    expect(body.result.tools).toEqual([]);
  });
});

describe('confirmación en el servidor', () => {
  it('extend_trial primero resume, luego ejecuta con el token, y el token no se reutiliza', async () => {
    const c = await connect();
    const sub = db.find('kefy_subscriptions', (r) => r.org_id === IDS.ORG)!;
    sub.status = 'trialing';
    sub.stripe_subscription_id = null;
    sub.current_period_end = '2020-01-01T00:00:00.000Z';
    const args = { org_id: IDS.ORG, days: 14, reason: 'Owner asked by WhatsApp' };

    const first = await tool(c.access!, 'extend_trial', args);
    expect(first.structuredContent.status).toBe('confirmation_required');
    expect(first.structuredContent.summary).toContain(IDS.ORG);
    expect(sub.current_period_end).toBe('2020-01-01T00:00:00.000Z');

    const tokenValue = first.structuredContent.confirmation_token;
    const other = await tool(c.access!, 'extend_trial', { ...args, days: 30, confirmation_token: tokenValue });
    expect(other.isError).toBe(true);
    expect(other.content[0].text).toMatch(/^invalid_confirmation/);

    const done = await tool(c.access!, 'extend_trial', { ...args, confirmation_token: tokenValue });
    expect(done.isError).toBe(false);
    expect(new Date(sub.current_period_end as string).getTime()).toBeGreaterThan(Date.now() + 13 * 86400000);
    const audit = db.rows('kefy_admin_audit_log');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tool_name: 'extend_trial', status: 'succeeded', target_org_id: IDS.ORG, reason: args.reason, admin_email: 'boss@kefy.app' });

    const again = await tool(c.access!, 'extend_trial', { ...args, confirmation_token: tokenValue });
    expect(again.content[0].text).toMatch(/^confirmation_used/);
  });

  it('no toca una suscripción de Stripe', async () => {
    const c = await connect();
    const sub = db.find('kefy_subscriptions', (r) => r.org_id === IDS.ORG)!;
    sub.status = 'active';
    sub.stripe_subscription_id = 'sub_123';
    const r = await tool(c.access!, 'extend_trial', { org_id: IDS.ORG, days: 7, reason: 'test reason' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/^conflict/);
  });

  it('grant_credits baja el contador del mes (puede quedar negativo)', async () => {
    const c = await connect();
    const period = new Date().toISOString().slice(0, 7);
    db.seed('kefy_usage_counters', [{ org_id: IDS.ORG, period, credits: 40 }]);
    const args = { org_id: IDS.ORG, credits: 100, reason: 'Compensation for outage' };
    const first = await tool(c.access!, 'grant_credits', args);
    const done = await tool(c.access!, 'grant_credits', { ...args, confirmation_token: first.structuredContent.confirmation_token });
    expect(done.structuredContent.data).toMatchObject({ used_before: 40, used_after: -60 });
  });
});

describe('pipeline comercial', () => {
  it('carga prospección deduplicando por email e Instagram y respetando supresiones', async () => {
    const c = await connect();
    await tool(c.access!, 'add_sales_suppression', { kind: 'domain', value: 'nope.cl' });

    const r = await tool(c.access!, 'upsert_outreach_leads', {
      leads: [
        { company: 'Café Uno', email: 'Hola@CafeUno.cl', instagram: '@cafeuno', city: 'Santiago', tags: ['cafe'] },
        { company: 'Café Uno dup', instagram: 'https://instagram.com/cafeuno/' },
        { company: 'Bloqueado', email: 'x@nope.cl' },
        { company: 'Sin contacto' },
      ],
    });
    expect(r.structuredContent.data).toMatchObject({ created: 1, skipped: 3 });
    const reasons = r.structuredContent.data.details.skipped.map((s: { reason: string }) => s.reason);
    expect(reasons).toEqual(expect.arrayContaining(['duplicate_in_batch', 'domain_suppressed']));
    expect(db.rows('kefy_sales_leads')[0]).toMatchObject({ email: 'hola@cafeuno.cl', instagram: 'cafeuno', kind: 'outreach', stage: 'new' });

    // Una segunda carga del mismo lead solo completa lo vacío.
    const r2 = await tool(c.access!, 'upsert_outreach_leads', {
      leads: [{ instagram: 'cafeuno', phone: '+56 9 1234 5678', city: 'Valparaíso', tags: ['vip'] }],
    });
    expect(r2.structuredContent.data).toMatchObject({ created: 0, updated: 1 });
    expect(db.rows('kefy_sales_leads')[0]).toMatchObject({ city: 'Santiago', phone: '+56912345678', tags: ['cafe', 'vip'] });
  });

  it('registrar un contacto mueve la etapa y fija el seguimiento; no se contacta a un suprimido', async () => {
    const c = await connect();
    await tool(c.access!, 'upsert_outreach_leads', { leads: [{ email: 'a@b.cl' }, { email: 'c@d.cl' }] });
    const [lead, other] = db.rows('kefy_sales_leads');

    const r = await tool(c.access!, 'log_sales_activity', {
      lead_id: lead.id, type: 'email', body: 'Primer correo', next_action: 'Seguimiento', next_action_at: '2030-01-01T12:00:00Z',
    });
    expect(r.structuredContent.data.stage).toBe('contacted');
    expect(lead).toMatchObject({ stage: 'contacted', next_action: 'Seguimiento' });

    const reply = await tool(c.access!, 'log_sales_activity', { lead_id: lead.id, type: 'email', direction: 'inbound' });
    expect(reply.structuredContent.data.stage).toBe('replied');

    await tool(c.access!, 'add_sales_suppression', { kind: 'email', value: 'C@D.cl', reason: 'Pidió no recibir más' });
    expect(other).toMatchObject({ stage: 'lost', lost_reason: 'do_not_contact' });
    const blocked = await tool(c.access!, 'log_sales_activity', { lead_id: other.id, type: 'whatsapp' });
    expect(blocked.content[0].text).toMatch(/^conflict/);

    const list = await tool(c.access!, 'list_sales_leads', { contactable_only: true });
    expect(list.structuredContent.data.leads.map((l: { id: string }) => l.id)).toEqual([lead.id]);
  });

  it('segmenta usuarios de Kefy y los importa como leads con su dueño', async () => {
    const c = await connect();
    db.find('kefy_org_memberships', (r) => r.user_id === IDS.USER)!.kefy_users = { email: 'boss@kefy.app', name: 'Boss' };
    db.find('kefy_org_memberships', (r) => r.user_id === IDS.OTHER_USER)!.kefy_users = { email: 'owner@otra.cl', name: 'Otra Owner' };
    const subs = db.rows('kefy_subscriptions');
    Object.assign(subs.find((s) => s.org_id === IDS.ORG)!, { status: 'trialing', stripe_subscription_id: null, current_period_end: new Date(Date.now() + 3 * 86400000).toISOString() });
    Object.assign(subs.find((s) => s.org_id === IDS.OTHER_ORG)!, { status: 'past_due', stripe_subscription_id: 'sub_1' });
    for (const o of db.rows('kefy_organizations')) o.created_at = '2026-01-01T00:00:00Z';

    const found = await tool(c.access!, 'find_account_lead_candidates', {});
    const bySegment = Object.fromEntries(found.structuredContent.data.candidates.map((x: { org_id: string; segment: string }) => [x.org_id, x.segment]));
    expect(bySegment).toEqual({ [IDS.ORG]: 'trial_ending', [IDS.OTHER_ORG]: 'payment_failed' });

    const imported = await tool(c.access!, 'import_account_leads', { org_ids: [IDS.OTHER_ORG] });
    expect(imported.structuredContent.data.created).toBe(1);
    expect(db.rows('kefy_sales_leads')[0]).toMatchObject({
      kind: 'kefy_account', org_id: IDS.OTHER_ORG, email: 'owner@otra.cl', segment: 'payment_failed', offer: 'platform',
    });

    const again = await tool(c.access!, 'find_account_lead_candidates', {});
    expect(again.structuredContent.data.candidates.map((x: { org_id: string }) => x.org_id)).toEqual([IDS.ORG]);
  });

  it('exporta CSV sin permitir fórmulas', async () => {
    const c = await connect();
    await tool(c.access!, 'upsert_outreach_leads', { leads: [{ company: '=HYPERLINK("x")', email: 'e@f.cl' }] });
    const r = await tool(c.access!, 'export_sales_leads', {});
    expect(r.structuredContent.data.rows).toBe(1);
    expect(r.structuredContent.data.csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('piezas puras', () => {
  it('parseRuntimeLogs filtra por nivel, ruta, texto y estado e ignora delimitadores', async () => {
    const { parseRuntimeLogs } = await import('@/lib/services/admin/logs');
    const lines = [
      { source: 'delimiter', timestampInMs: 1 },
      { level: 'error', source: 'serverless', requestPath: '/api/mcp', responseStatusCode: 500, message: 'Boom zernio', timestampInMs: 1731200000000 },
      { level: 'info', source: 'serverless', requestPath: '/api/mcp', responseStatusCode: 200, message: 'ok', timestampInMs: 1731200000001 },
      'not json',
    ].map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
    expect(parseRuntimeLogs(lines, {})).toHaveLength(2);
    expect(parseRuntimeLogs(lines, { levels: ['error'] })).toHaveLength(1);
    expect(parseRuntimeLogs(lines, { contains: 'ZERNIO', path: '/api/mcp', status_min: 500 })[0]).toMatchObject({ status: 500, level: 'error' });
  });

  it('classifyAccount: estancada → servicio gestionado; cerca del tope → plataforma', async () => {
    const { classifyAccount } = await import('@/lib/services/admin/sales-leads');
    const now = new Date('2026-11-10T00:00:00Z');
    const active = { status: 'active', stripe_subscription_id: 'sub', current_period_end: '2026-12-01T00:00:00Z', plan: 'starter' };
    expect(classifyAccount({ sub: active, now, creditsUsed: 0, plan: 'starter', lastContentAt: null, activeSocialAccounts: 0, createdAt: '2026-10-01T00:00:00Z' }))
      .toMatchObject({ segment: 'stalled', offer: 'managed_service' });
    expect(classifyAccount({ sub: active, now, creditsUsed: 140, plan: 'starter', lastContentAt: '2026-11-09T00:00:00Z', activeSocialAccounts: 2, createdAt: '2026-10-01T00:00:00Z' }))
      .toMatchObject({ segment: 'near_credit_limit', offer: 'platform' });
    expect(classifyAccount({ sub: active, now, creditsUsed: 10, plan: 'starter', lastContentAt: '2026-11-09T00:00:00Z', activeSocialAccounts: 2, createdAt: '2026-10-01T00:00:00Z' }))
      .toBeNull();
  });
});

describe('lecturas de la plataforma', () => {
  it('panorama, organizaciones, detalle, fallos y auditoría responden sin error', async () => {
    const c = await connect();
    db.find('kefy_org_memberships', (r) => r.user_id === IDS.USER)!.kefy_users = { email: 'boss@kefy.app', name: 'Boss' };
    db.seed('kefy_scheduled_posts', [{ id: IDS.uuid(90), org_id: IDS.OTHER_ORG, status: 'failed', error_message: 'Token expired', updated_at: new Date().toISOString() }]);

    const overview = await tool(c.access!, 'get_platform_overview', { days: 7 });
    expect(overview.isError).toBe(false);
    expect(overview.structuredContent.data.organizations.total).toBe(2);

    const search = await tool(c.access!, 'search_organizations', { query: 'boss@kefy' });
    expect(search.structuredContent.data.organizations.map((o: { id: string }) => o.id)).toEqual([IDS.ORG]);

    const detail = await tool(c.access!, 'get_organization', { org_id: IDS.ORG });
    expect(detail.isError).toBe(false);
    expect(detail.structuredContent.data.brands).toHaveLength(3);

    const failures = await tool(c.access!, 'list_recent_failures', { hours: 24 });
    expect(failures.structuredContent.data.failed_posts[0]).toMatchObject({ org_name: 'Otra', error_message: 'Token expired' });

    await tool(c.access!, 'add_organization_note', { org_id: IDS.ORG, body: 'Llamó por soporte' });
    const audit = await tool(c.access!, 'list_audit_log', { log: 'admin' });
    expect(audit.structuredContent.data.entries[0]).toMatchObject({ tool_name: 'add_organization_note', status: 'succeeded' });

    const sentry = await tool(c.access!, 'list_sentry_issues', {});
    expect(sentry.isError).toBe(true);
    expect(sentry.content[0].text).toMatch(/^unavailable: Sentry is not configured/);
  });
});
