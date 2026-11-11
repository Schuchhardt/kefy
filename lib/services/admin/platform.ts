// ─── Administración de la plataforma: organizaciones, usuarios y cuentas ─────
//
// Lecturas de todas las organizaciones y las pocas escrituras de soporte que
// el MCP de administración permite (extender un trial, dar créditos del mes,
// pausar una regla de autopilot, revocar una key, notas internas). Todo con
// el cliente de servicio: estas funciones NO filtran por organización, así
// que solo las llama lib/admin/tools/* tras authenticateAdmin.
//
// Ver docs/admin-mcp.md.

import { createSupabaseServer } from '@/lib/supabase';
import { PLAN_LIMITS, PLAN_PRICES_USD, isBillingPlan } from '@/lib/plans';
import { resolveEntitlement } from '@/lib/subscription';
import { usagePeriod } from '@/lib/usage';
import { ServiceError } from '@/lib/services/errors';
import type { AdminContext } from '@/lib/services/admin/context';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const DAY_MS = 24 * 60 * 60 * 1000;

export function db() {
  return createSupabaseServer();
}

/** Lanza un ServiceError 503 si la consulta falló; si no, devuelve las filas. */
export function rowsOrThrow<T = Row>(res: { data: unknown; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new ServiceError('unavailable', 503, `Database error (${what}): ${res.error.message}`);
  return (res.data as T[] | null) ?? [];
}

function countOrThrow(res: { count: number | null; error: { message: string } | null }, what: string): number {
  if (res.error) throw new ServiceError('unavailable', 503, `Database error (${what}): ${res.error.message}`);
  return res.count ?? 0;
}

const iso = (d: Date) => d.toISOString();
const daysAgo = (ctx: AdminContext, days: number) => new Date(ctx.now.getTime() - days * DAY_MS);

/** Lo que la fila de suscripción significa hoy, para el admin. */
export function subscriptionSummary(sub: Row | null | undefined, now: Date) {
  const ent = resolveEntitlement(sub ? { status: sub.status, current_period_end: sub.current_period_end } : null, now);
  return {
    plan: (sub?.plan as string | undefined) ?? null,
    status: (sub?.status as string | undefined) ?? null,
    can_create: ent.canCreate,
    blocked_reason: ent.reason,
    period_end: (sub?.current_period_end as string | undefined) ?? null,
    trial_days_left: ent.trialDaysLeft,
    /** Con Stripe la suscripción la manda Stripe: no se toca a mano. */
    has_stripe_subscription: !!sub?.stripe_subscription_id,
    paying: sub?.status === 'active' && !!sub?.stripe_subscription_id,
  };
}

/** Dueño de cada organización (email y nombre). */
async function ownersByOrg(orgIds: string[]): Promise<Map<string, { user_id: string; email: string | null; name: string | null }>> {
  const out = new Map<string, { user_id: string; email: string | null; name: string | null }>();
  if (orgIds.length === 0) return out;
  const rows = rowsOrThrow(await db()
    .from('kefy_org_memberships')
    .select('org_id, user_id, role, kefy_users(email, name)')
    .in('org_id', orgIds)
    .eq('role', 'owner'), 'owners');
  for (const r of rows) {
    const u = Array.isArray(r.kefy_users) ? r.kefy_users[0] : r.kefy_users;
    if (!out.has(r.org_id)) out.set(r.org_id, { user_id: r.user_id, email: u?.email ?? null, name: u?.name ?? null });
  }
  return out;
}

async function byOrg(table: string, columns: string, orgIds: string[], what: string, extra?: (q: any) => any): Promise<Map<string, Row[]>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Map<string, Row[]>();
  if (orgIds.length === 0) return out;
  let q = db().from(table).select(columns).in('org_id', orgIds);
  if (extra) q = extra(q);
  for (const r of rowsOrThrow(await q, what)) {
    const list = out.get(r.org_id) ?? [];
    list.push(r);
    out.set(r.org_id, list);
  }
  return out;
}

// ─── Panorama ────────────────────────────────────────────────────────────────

export async function getPlatformOverview(ctx: AdminContext, input: { days: number }) {
  const since = iso(daysAgo(ctx, input.days));
  const period = usagePeriod(ctx.now);
  const head = { count: 'exact' as const, head: true };

  const [
    orgsTotal, orgsNew, usersTotal, usersNew, subs, usage,
    contentNew, postsPublished, postsFailed, autopilotFailed, videoFailed, signups,
  ] = await Promise.all([
    db().from('kefy_organizations').select('id', head),
    db().from('kefy_organizations').select('id', head).gte('created_at', since),
    db().from('kefy_users').select('id', head),
    db().from('kefy_users').select('id', head).gte('created_at', since),
    db().from('kefy_subscriptions').select('org_id, plan, status, current_period_end, stripe_subscription_id'),
    db().from('kefy_usage_counters').select('org_id, credits, assistant_messages').eq('period', period),
    db().from('kefy_content_items').select('id', head).gte('created_at', since),
    db().from('kefy_scheduled_posts').select('id', head).eq('status', 'published').gte('published_at', since),
    db().from('kefy_scheduled_posts').select('id', head).eq('status', 'failed').gte('updated_at', since),
    db().from('kefy_autopilot_runs').select('id', head).eq('status', 'failed').gte('ran_at', since),
    db().from('kefy_video_jobs').select('id', head).eq('status', 'failed').gte('updated_at', since),
    db().from('kefy_organizations').select('created_at').gte('created_at', since),
  ]);

  const subRows = rowsOrThrow(subs, 'subscriptions');
  const byStatus: Record<string, number> = {};
  const byPlan: Record<string, number> = {};
  let trialsActive = 0;
  let trialsExpired = 0;
  let trialsEndingSoon = 0;
  let paying = 0;
  let mrrUsd = 0;
  for (const s of subRows) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
    const summary = subscriptionSummary(s, ctx.now);
    if (s.status === 'trialing') {
      if (summary.can_create) {
        trialsActive += 1;
        if ((summary.trial_days_left ?? 99) <= 7) trialsEndingSoon += 1;
      } else {
        trialsExpired += 1;
      }
    }
    if (summary.paying) {
      paying += 1;
      if (isBillingPlan(s.plan)) mrrUsd += PLAN_PRICES_USD[s.plan];
    }
  }

  const usageRows = rowsOrThrow(usage, 'usage');
  const creditsUsed = usageRows.reduce((n, r) => n + Math.max(0, Number(r.credits) || 0), 0);
  const messagesUsed = usageRows.reduce((n, r) => n + (Number(r.assistant_messages) || 0), 0);
  const topUsage = [...usageRows].sort((a, b) => (b.credits ?? 0) - (a.credits ?? 0)).slice(0, 5);

  const daily: Record<string, number> = {};
  for (const r of rowsOrThrow(signups, 'signups')) {
    const day = String(r.created_at).slice(0, 10);
    daily[day] = (daily[day] ?? 0) + 1;
  }

  return {
    window_days: input.days,
    organizations: { total: countOrThrow(orgsTotal, 'orgs'), new_in_window: countOrThrow(orgsNew, 'orgs new') },
    users: { total: countOrThrow(usersTotal, 'users'), new_in_window: countOrThrow(usersNew, 'users new') },
    subscriptions: {
      by_status: byStatus,
      by_plan: byPlan,
      trials_active: trialsActive,
      trials_ending_in_7_days: trialsEndingSoon,
      trials_expired_unpaid: trialsExpired,
      paying,
      mrr_usd_estimate: mrrUsd,
    },
    usage_this_month: {
      period,
      credits_used: creditsUsed,
      assistant_messages: messagesUsed,
      top_orgs_by_credits: topUsage.map((r) => ({ org_id: r.org_id, credits: r.credits })),
    },
    activity_in_window: {
      content_created: countOrThrow(contentNew, 'content'),
      posts_published: countOrThrow(postsPublished, 'published'),
      posts_failed: countOrThrow(postsFailed, 'posts failed'),
      autopilot_runs_failed: countOrThrow(autopilotFailed, 'autopilot failed'),
      video_jobs_failed: countOrThrow(videoFailed, 'video failed'),
    },
    signups_by_day: Object.entries(daily).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, count]) => ({ day, count })),
  };
}

// ─── Organizaciones ──────────────────────────────────────────────────────────

/** Ids de organización donde es miembro alguien cuyo email o nombre coincide. */
async function orgIdsByUser(query: string): Promise<string[]> {
  const users = rowsOrThrow(await db()
    .from('kefy_users')
    .select('id')
    .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(50), 'users');
  if (users.length === 0) return [];
  const mem = rowsOrThrow(await db()
    .from('kefy_org_memberships')
    .select('org_id')
    .in('user_id', users.map((u) => u.id)), 'memberships');
  return [...new Set(mem.map((m) => m.org_id as string))];
}

/** Quita lo que rompería un filtro de PostgREST (comas, paréntesis, comodines). */
export function safeQuery(q: string): string {
  return q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 100);
}

export async function searchOrganizations(ctx: AdminContext, input: {
  query?: string; status?: string; plan?: string; limit: number; offset: number;
}) {
  let q = db().from('kefy_organizations').select('id, name, slug, plan, created_at')
    .order('created_at', { ascending: false });

  const text = input.query ? safeQuery(input.query) : '';
  if (text) {
    const viaUsers = await orgIdsByUser(text);
    const clauses = [`name.ilike.%${text}%`, `slug.ilike.%${text}%`];
    if (/^[0-9a-f-]{36}$/i.test(text)) clauses.push(`id.eq.${text}`);
    if (viaUsers.length) clauses.push(`id.in.(${viaUsers.join(',')})`);
    q = q.or(clauses.join(','));
  }

  if (input.status || input.plan) {
    let sq = db().from('kefy_subscriptions').select('org_id');
    if (input.status) sq = sq.eq('status', input.status);
    if (input.plan) sq = sq.eq('plan', input.plan);
    const ids = rowsOrThrow(await sq, 'subscriptions filter').map((r) => r.org_id as string);
    if (ids.length === 0) return { organizations: [], has_more: false };
    q = q.in('id', ids);
  }

  const orgs = rowsOrThrow(await q.range(input.offset, input.offset + input.limit), 'organizations');
  const hasMore = orgs.length > input.limit;
  const page = orgs.slice(0, input.limit);
  const ids = page.map((o) => o.id as string);
  const period = usagePeriod(ctx.now);

  const [owners, subs, usage, brands, accounts] = await Promise.all([
    ownersByOrg(ids),
    byOrg('kefy_subscriptions', 'org_id, plan, status, current_period_end, stripe_subscription_id', ids, 'subs'),
    byOrg('kefy_usage_counters', 'org_id, credits', ids, 'usage', (x) => x.eq('period', period)),
    byOrg('kefy_brands', 'org_id, id', ids, 'brands', (x) => x.eq('archived', false)),
    byOrg('kefy_social_accounts', 'org_id, platform, status', ids, 'accounts'),
  ]);

  return {
    organizations: page.map((o) => {
      const sub = subs.get(o.id)?.[0] ?? null;
      const plan = (sub?.plan ?? o.plan) as string;
      const social = accounts.get(o.id) ?? [];
      return {
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        owner: owners.get(o.id) ?? null,
        subscription: subscriptionSummary(sub, ctx.now),
        credits: {
          used: usage.get(o.id)?.[0]?.credits ?? 0,
          limit: isBillingPlan(plan) ? PLAN_LIMITS[plan].credits : null,
        },
        brands: (brands.get(o.id) ?? []).length,
        social_accounts: {
          active: social.filter((a) => a.status === 'active').length,
          broken: social.filter((a) => a.status !== 'active').length,
        },
      };
    }),
    has_more: hasMore,
  };
}

export async function getOrganization(ctx: AdminContext, input: { org_id: string }) {
  const orgId = input.org_id;
  const org = rowsOrThrow(await db().from('kefy_organizations')
    .select('id, name, slug, plan, created_at, zernio_profile_id').eq('id', orgId).limit(1), 'org')[0];
  if (!org) throw new ServiceError('not_found', 404, 'Organization not found');

  const period = usagePeriod(ctx.now);
  const since30 = iso(daysAgo(ctx, 30));
  const [
    sub, members, brands, usage, accounts, content, failedPosts, rules, failedRuns, videoJobs, keys, notes, lead, audit,
  ] = await Promise.all([
    db().from('kefy_subscriptions').select('*').eq('org_id', orgId).maybeSingle(),
    db().from('kefy_org_memberships').select('user_id, role, created_at, kefy_users(email, name, created_at)').eq('org_id', orgId),
    db().from('kefy_brands').select('id, name, archived, created_at').eq('org_id', orgId),
    db().from('kefy_usage_counters').select('period, credits, assistant_messages').eq('org_id', orgId)
      .order('period', { ascending: false }).limit(3),
    db().from('kefy_social_accounts').select('id, brand_id, platform, username, status, status_reason, created_at').eq('org_id', orgId),
    db().from('kefy_content_items').select('status, content_type, created_at').eq('org_id', orgId).gte('created_at', since30),
    db().from('kefy_scheduled_posts').select('id, brand_id, content_item_id, status, error_message, scheduled_at, updated_at')
      .eq('org_id', orgId).eq('status', 'failed').order('updated_at', { ascending: false }).limit(10),
    db().from('kefy_autopilot_rules').select('id, brand_id, name, status, paused_reason, frequency, format, next_run_at, last_run_at').eq('org_id', orgId),
    db().from('kefy_autopilot_runs').select('id, rule_id, status, error_message, ran_at').eq('org_id', orgId)
      .eq('status', 'failed').order('ran_at', { ascending: false }).limit(10),
    db().from('kefy_video_jobs').select('id, status, error, created_at, finished_at').eq('org_id', orgId)
      .order('created_at', { ascending: false }).limit(10),
    db().from('kefy_api_keys').select('id, name, kind, key_prefix, scopes, brand_id, last_used_at, expires_at, revoked_at, created_at').eq('org_id', orgId),
    db().from('kefy_admin_org_notes').select('id, body, created_by, created_at').eq('org_id', orgId)
      .order('created_at', { ascending: false }).limit(20),
    db().from('kefy_sales_leads').select('id, stage, offer, next_action, next_action_at').eq('org_id', orgId).maybeSingle(),
    db().from('kefy_admin_audit_log').select('tool_name, reason, status, admin_email, created_at').eq('target_org_id', orgId)
      .order('created_at', { ascending: false }).limit(10),
  ]);
  if (sub.error) rowsOrThrow(sub, 'subscription');

  const contentRows = rowsOrThrow(content, 'content');
  const contentByStatus: Record<string, number> = {};
  const contentByType: Record<string, number> = {};
  for (const c of contentRows) {
    contentByStatus[c.status] = (contentByStatus[c.status] ?? 0) + 1;
    contentByType[c.content_type] = (contentByType[c.content_type] ?? 0) + 1;
  }
  const subRow = sub.data as Row | null;
  const plan = (subRow?.plan ?? org.plan) as string;

  return {
    organization: { id: org.id, name: org.name, slug: org.slug, created_at: org.created_at, has_zernio_profile: !!org.zernio_profile_id },
    subscription: subscriptionSummary(subRow, ctx.now),
    plan_limits: isBillingPlan(plan) ? PLAN_LIMITS[plan] : null,
    members: rowsOrThrow(members, 'members').map((m) => {
      const u = Array.isArray(m.kefy_users) ? m.kefy_users[0] : m.kefy_users;
      return { user_id: m.user_id, role: m.role, email: u?.email ?? null, name: u?.name ?? null, joined_at: m.created_at };
    }),
    brands: rowsOrThrow(brands, 'brands'),
    usage: rowsOrThrow(usage, 'usage').map((u) => ({ ...u, current: u.period === period })),
    social_accounts: rowsOrThrow(accounts, 'accounts'),
    content_last_30_days: { total: contentRows.length, by_status: contentByStatus, by_type: contentByType },
    failed_posts: rowsOrThrow(failedPosts, 'failed posts'),
    autopilot_rules: rowsOrThrow(rules, 'rules'),
    failed_autopilot_runs: rowsOrThrow(failedRuns, 'runs'),
    recent_video_jobs: rowsOrThrow(videoJobs, 'video jobs'),
    api_keys: rowsOrThrow(keys, 'keys').map((k) => ({ ...k, active: !k.revoked_at })),
    admin_notes: rowsOrThrow(notes, 'notes'),
    sales_lead: (lead.data as Row | null) ?? null,
    admin_actions: rowsOrThrow(audit, 'audit'),
  };
}

export async function searchUsers(_ctx: AdminContext, input: { query: string; limit: number }) {
  const text = safeQuery(input.query);
  if (!text) throw new ServiceError('invalid_input', 422, 'query is required');
  const users = rowsOrThrow(await db().from('kefy_users')
    .select('id, email, name, created_at')
    .or(`email.ilike.%${text}%,name.ilike.%${text}%`)
    .order('created_at', { ascending: false })
    .limit(input.limit), 'users');
  if (users.length === 0) return { users: [] };
  const mem = rowsOrThrow(await db().from('kefy_org_memberships')
    .select('user_id, org_id, role, kefy_organizations(name)')
    .in('user_id', users.map((u) => u.id)), 'memberships');
  return {
    users: users.map((u) => ({
      ...u,
      organizations: mem.filter((m) => m.user_id === u.id).map((m) => {
        const o = Array.isArray(m.kefy_organizations) ? m.kefy_organizations[0] : m.kefy_organizations;
        return { org_id: m.org_id, name: o?.name ?? null, role: m.role };
      }),
    })),
  };
}

// ─── Escrituras de soporte ───────────────────────────────────────────────────

async function loadSubscription(orgId: string): Promise<Row> {
  const res = await db().from('kefy_subscriptions').select('*').eq('org_id', orgId).maybeSingle();
  if (res.error) throw new ServiceError('unavailable', 503, res.error.message);
  if (!res.data) throw new ServiceError('not_found', 404, 'The organization has no subscription row');
  return res.data as Row;
}

export function trialEnd(ctx: AdminContext, sub: Row, input: { days?: number; until?: string }): Date {
  if (input.until) {
    const d = new Date(input.until);
    if (Number.isNaN(d.getTime())) throw new ServiceError('invalid_input', 422, 'until must be an ISO date');
    return d;
  }
  // Se suma desde hoy o desde el fin actual si aún no venció.
  const current = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const base = current && current.getTime() > ctx.now.getTime() ? current : ctx.now;
  return new Date(base.getTime() + (input.days ?? 0) * DAY_MS);
}

export async function describeExtendTrial(ctx: AdminContext, input: { org_id: string; days?: number; until?: string }) {
  const sub = await loadSubscription(input.org_id);
  assertTrialEditable(sub);
  const end = trialEnd(ctx, sub, input);
  return `Extend the trial of organization ${input.org_id} (status ${sub.status}, ends ${sub.current_period_end ?? 'never set'}) `
    + `until ${end.toISOString()}. The account will be able to create again until then.`;
}

function assertTrialEditable(sub: Row) {
  // Con Stripe la suscripción la manda Stripe: el siguiente webhook pisaría el cambio.
  if (sub.stripe_subscription_id && sub.status !== 'canceled') {
    throw new ServiceError('conflict', 409, 'This organization has a Stripe subscription: change it in Stripe, not here.');
  }
}

export async function extendTrial(ctx: AdminContext, input: { org_id: string; days?: number; until?: string }) {
  const sub = await loadSubscription(input.org_id);
  assertTrialEditable(sub);
  const end = trialEnd(ctx, sub, input);
  if (end.getTime() <= ctx.now.getTime()) throw new ServiceError('invalid_input', 422, 'The new trial end must be in the future');
  const { error } = await db().from('kefy_subscriptions')
    .update({ status: 'trialing', current_period_end: end.toISOString(), updated_at: ctx.now.toISOString() })
    .eq('org_id', input.org_id);
  if (error) throw new ServiceError('unavailable', 503, error.message);
  return {
    before: { status: sub.status, period_end: sub.current_period_end },
    after: subscriptionSummary({ ...sub, status: 'trialing', current_period_end: end.toISOString() }, ctx.now),
  };
}

/**
 * Créditos extra para el mes en curso: baja el contador de usados (puede
 * quedar negativo). El mes siguiente arranca en cero como siempre.
 */
export async function grantCredits(ctx: AdminContext, input: { org_id: string; credits: number }) {
  const period = usagePeriod(ctx.now);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cur = await db().from('kefy_usage_counters').select('credits').eq('org_id', input.org_id).eq('period', period).maybeSingle();
    if (cur.error) throw new ServiceError('unavailable', 503, cur.error.message);
    if (!cur.data) {
      const { error } = await db().from('kefy_usage_counters')
        .insert({ org_id: input.org_id, period, credits: -input.credits, updated_at: ctx.now.toISOString() });
      if (!error) return { period, used_before: 0, used_after: -input.credits };
      if (error.code !== '23505') throw new ServiceError('unavailable', 503, error.message);
      continue;
    }
    const before = Number(cur.data.credits) || 0;
    // Solo si nadie consumió entre la lectura y aquí.
    const upd = await db().from('kefy_usage_counters')
      .update({ credits: before - input.credits, updated_at: ctx.now.toISOString() })
      .eq('org_id', input.org_id).eq('period', period).eq('credits', before)
      .select('credits');
    if (upd.error) throw new ServiceError('unavailable', 503, upd.error.message);
    if ((upd.data ?? []).length > 0) return { period, used_before: before, used_after: before - input.credits };
  }
  throw new ServiceError('conflict', 409, 'The counter kept changing; try again.');
}

export async function setAutopilotRuleStatus(ctx: AdminContext, input: { rule_id: string; status: 'active' | 'paused' }) {
  const res = await db().from('kefy_autopilot_rules')
    .update({ status: input.status, ...(input.status === 'active' ? { paused_reason: null, paused_at: null } : {}), updated_at: ctx.now.toISOString() })
    .eq('id', input.rule_id)
    .select('id, org_id, name, status');
  const rows = rowsOrThrow(res, 'autopilot rule');
  if (rows.length === 0) throw new ServiceError('not_found', 404, 'Autopilot rule not found');
  return rows[0];
}

export async function revokeApiKey(ctx: AdminContext, input: { key_id: string }) {
  const res = await db().from('kefy_api_keys')
    .update({ revoked_at: ctx.now.toISOString() })
    .eq('id', input.key_id)
    .is('revoked_at', null)
    .select('id, org_id, name, kind, key_prefix');
  const rows = rowsOrThrow(res, 'api key');
  if (rows.length === 0) throw new ServiceError('not_found', 404, 'Active API key not found');
  return rows[0];
}

export async function addOrgNote(ctx: AdminContext, input: { org_id: string; body: string }) {
  const res = await db().from('kefy_admin_org_notes')
    .insert({ org_id: input.org_id, body: input.body, created_by: ctx.adminEmail })
    .select('id, org_id, body, created_by, created_at');
  if (res.error?.code === '23503') throw new ServiceError('not_found', 404, 'Organization not found');
  return rowsOrThrow(res, 'note')[0];
}
