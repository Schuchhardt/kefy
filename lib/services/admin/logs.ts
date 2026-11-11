// ─── Administración: logs y salud del sistema ────────────────────────────────
//
// Tres fuentes, de la más barata a la más cara:
//   1. La base: lo que ya queda guardado cuando algo falla (publicaciones,
//      autopilot, video, respuestas automáticas, cuentas rotas) y la
//      auditoría del asistente/API/MCP y del propio admin.
//   2. Sentry: issues agrupados con su último evento (SENTRY_API_TOKEN con
//      event:read; el SENTRY_AUTH_TOKEN de los source maps no suele servir).
//   3. Vercel: logs de runtime del último despliegue de producción
//      (VERCEL_API_TOKEN + VERCEL_PROJECT_ID). Vercel guarda poco: es para
//      «qué está pasando ahora», no para historia.
//
// Ver docs/admin-mcp.md.

import { ServiceError } from '@/lib/services/errors';
import { db, rowsOrThrow } from '@/lib/services/admin/platform';
import type { AdminContext } from '@/lib/services/admin/context';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const HOUR_MS = 60 * 60 * 1000;

async function orgNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = rowsOrThrow(await db().from('kefy_organizations').select('id, name').in('id', unique), 'org names');
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

// ─── 1. Base de datos ────────────────────────────────────────────────────────

export async function listRecentFailures(ctx: AdminContext, input: { hours: number; org_id?: string; limit: number }) {
  const since = new Date(ctx.now.getTime() - input.hours * HOUR_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any) => (input.org_id ? q.eq('org_id', input.org_id) : q);
  const n = input.limit;

  const [posts, runs, videos, engagement, actions, accounts] = await Promise.all([
    scoped(db().from('kefy_scheduled_posts')
      .select('id, org_id, brand_id, content_item_id, social_account_id, error_message, scheduled_at, updated_at')
      .eq('status', 'failed').gte('updated_at', since)).order('updated_at', { ascending: false }).limit(n),
    scoped(db().from('kefy_autopilot_runs')
      .select('id, org_id, brand_id, rule_id, format, error_message, video_status, story_status, story_error, ran_at')
      .eq('status', 'failed').gte('ran_at', since)).order('ran_at', { ascending: false }).limit(n),
    scoped(db().from('kefy_video_jobs')
      .select('id, org_id, brand_id, target_id, motion, error, created_at, updated_at')
      .eq('status', 'failed').gte('updated_at', since)).order('updated_at', { ascending: false }).limit(n),
    scoped(db().from('kefy_engagement_jobs')
      .select('id, org_id, brand_id, rule_id, attempts, last_error, updated_at')
      .eq('status', 'failed').gte('updated_at', since)).order('updated_at', { ascending: false }).limit(n),
    scoped(db().from('kefy_assistant_actions')
      .select('id, org_id, brand_id, tool_name, source, error, created_at')
      .eq('status', 'failed').gte('created_at', since)).order('created_at', { ascending: false }).limit(n),
    scoped(db().from('kefy_social_accounts')
      .select('id, org_id, brand_id, platform, username, status, status_reason, updated_at')
      .neq('status', 'active').gte('updated_at', since)).order('updated_at', { ascending: false }).limit(n),
  ]);

  const sections = {
    failed_posts: rowsOrThrow(posts, 'posts'),
    failed_autopilot_runs: rowsOrThrow(runs, 'runs'),
    failed_video_jobs: rowsOrThrow(videos, 'videos'),
    failed_engagement_jobs: rowsOrThrow(engagement, 'engagement'),
    failed_assistant_actions: rowsOrThrow(actions, 'actions'),
    broken_social_accounts: rowsOrThrow(accounts, 'accounts'),
  };
  const names = await orgNames(Object.values(sections).flat().map((r) => r.org_id));
  const withOrg = (rows: Row[]) => rows.map((r) => ({ ...r, org_name: names.get(r.org_id) ?? null }));

  return {
    window_hours: input.hours,
    counts: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])),
    ...Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, withOrg(v)])),
  };
}

export async function listAuditLog(ctx: AdminContext, input: {
  log: 'assistant' | 'admin'; org_id?: string; tool?: string; status?: string; hours: number; limit: number;
}) {
  const since = new Date(ctx.now.getTime() - input.hours * HOUR_MS).toISOString();
  if (input.log === 'admin') {
    let q = db().from('kefy_admin_audit_log')
      .select('id, admin_email, tool_name, input, reason, target_org_id, status, error, created_at')
      .gte('created_at', since);
    if (input.org_id) q = q.eq('target_org_id', input.org_id);
    if (input.tool) q = q.eq('tool_name', input.tool);
    if (input.status) q = q.eq('status', input.status);
    return { entries: rowsOrThrow(await q.order('created_at', { ascending: false }).limit(input.limit), 'admin audit') };
  }
  let q = db().from('kefy_assistant_actions')
    .select('id, org_id, brand_id, user_id, api_key_id, tool_name, source, kind, status, error, credits_estimated, created_at, completed_at')
    .gte('created_at', since);
  if (input.org_id) q = q.eq('org_id', input.org_id);
  if (input.tool) q = q.eq('tool_name', input.tool);
  if (input.status) q = q.eq('status', input.status);
  const rows = rowsOrThrow(await q.order('created_at', { ascending: false }).limit(input.limit), 'assistant audit');
  const names = await orgNames(rows.map((r) => r.org_id));
  return { entries: rows.map((r) => ({ ...r, org_name: names.get(r.org_id) ?? null })) };
}

// ─── 2. Sentry ───────────────────────────────────────────────────────────────

function sentryConfig() {
  const token = process.env.SENTRY_API_TOKEN || process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    throw new ServiceError('unavailable', 503,
      'Sentry is not configured: set SENTRY_API_TOKEN (scopes event:read, project:read), SENTRY_ORG and SENTRY_PROJECT.');
  }
  const base = (process.env.SENTRY_API_URL || 'https://sentry.io').replace(/\/+$/, '');
  return { token, org, project, base };
}

async function sentryGet(path: string, timeoutMs = 15000): Promise<unknown> {
  const cfg = sentryConfig();
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/0${path}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (err) {
    throw new ServiceError('provider_error', 502, `Sentry did not respond: ${err instanceof Error ? err.message : String(err)}`).markReported();
  }
  if (res.status === 401 || res.status === 403) {
    throw new ServiceError('provider_error', 502, `Sentry rejected the token (${res.status}). It needs event:read and project:read.`).markReported();
  }
  if (res.status === 404) throw new ServiceError('not_found', 404, 'Not found in Sentry');
  if (!res.ok) throw new ServiceError('provider_error', 502, `Sentry error ${res.status}`).markReported();
  return res.json();
}

export async function listSentryIssues(_ctx: AdminContext, input: { query: string; period: '1h' | '24h' | '7d' | '14d'; limit: number }) {
  const cfg = sentryConfig();
  const params = new URLSearchParams({ query: input.query, statsPeriod: input.period, limit: String(input.limit), sort: 'date' });
  const issues = await sentryGet(`/projects/${encodeURIComponent(cfg.org)}/${encodeURIComponent(cfg.project)}/issues/?${params}`) as Row[];
  return {
    issues: (issues ?? []).map((i) => ({
      id: i.id,
      short_id: i.shortId,
      title: i.title,
      culprit: i.culprit,
      level: i.level,
      status: i.status,
      count: Number(i.count) || 0,
      users: i.userCount ?? 0,
      first_seen: i.firstSeen,
      last_seen: i.lastSeen,
      permalink: i.permalink,
    })),
  };
}

/** Frames de la app (sin node_modules), del más reciente al más antiguo. */
function appFrames(event: Row): string[] {
  const out: string[] = [];
  for (const entry of event.entries ?? []) {
    if (entry.type !== 'exception') continue;
    for (const value of entry.data?.values ?? []) {
      const frames: Row[] = value.stacktrace?.frames ?? [];
      for (const f of [...frames].reverse()) {
        if (f.inApp === false) continue;
        out.push(`${f.filename ?? f.module ?? '?'}:${f.lineNo ?? '?'} ${f.function ?? ''}`.trim());
        if (out.length >= 15) return out;
      }
    }
  }
  return out;
}

export async function getSentryIssue(_ctx: AdminContext, input: { issue_id: string }) {
  const cfg = sentryConfig();
  const org = encodeURIComponent(cfg.org);
  const id = encodeURIComponent(input.issue_id);
  const [issue, event] = await Promise.all([
    sentryGet(`/organizations/${org}/issues/${id}/`) as Promise<Row>,
    sentryGet(`/organizations/${org}/issues/${id}/events/latest/`) as Promise<Row>,
  ]);
  const exception = (event.entries ?? []).find((e: Row) => e.type === 'exception')?.data?.values?.[0];
  return {
    issue: {
      id: issue.id, short_id: issue.shortId, title: issue.title, culprit: issue.culprit, level: issue.level,
      status: issue.status, count: Number(issue.count) || 0, users: issue.userCount ?? 0,
      first_seen: issue.firstSeen, last_seen: issue.lastSeen, permalink: issue.permalink,
    },
    latest_event: {
      id: event.eventID,
      date: event.dateCreated,
      message: event.message || null,
      exception: exception ? { type: exception.type, value: exception.value } : null,
      app_frames: appFrames(event),
      tags: Object.fromEntries((event.tags ?? []).map((t: Row) => [t.key, t.value])),
      context: event.context ?? null,
    },
  };
}

// ─── 3. Vercel ───────────────────────────────────────────────────────────────

function vercelConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_ADMIN_PROJECT_ID || process.env.VERCEL_PROJECT_ID;
  if (!token || !project) {
    throw new ServiceError('unavailable', 503, 'Vercel logs are not configured: set VERCEL_API_TOKEN and VERCEL_PROJECT_ID (and VERCEL_TEAM_ID for a team project).');
  }
  return { token, project, team: process.env.VERCEL_TEAM_ID || null };
}

function vercelUrl(path: string, params: Record<string, string> = {}): string {
  const { team } = vercelConfig();
  const qs = new URLSearchParams({ ...params, ...(team ? { teamId: team } : {}) });
  return `https://api.vercel.com${path}?${qs}`;
}

async function latestProductionDeployment(): Promise<{ id: string; url: string; created: number }> {
  const cfg = vercelConfig();
  let res: Response;
  try {
    res = await fetch(vercelUrl('/v6/deployments', { projectId: cfg.project, target: 'production', state: 'READY', limit: '1' }), {
      headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
  } catch (err) {
    throw new ServiceError('provider_error', 502, `Vercel did not respond: ${err instanceof Error ? err.message : String(err)}`).markReported();
  }
  if (!res.ok) throw new ServiceError('provider_error', 502, `Vercel error ${res.status} listing deployments`).markReported();
  const body = await res.json() as { deployments?: Row[] };
  const d = body.deployments?.[0];
  if (!d) throw new ServiceError('not_found', 404, 'No ready production deployment found');
  return { id: d.uid, url: d.url, created: d.created };
}

export interface RuntimeLogLine {
  time: string;
  level: string;
  source: string;
  method: string | null;
  path: string | null;
  status: number | null;
  message: string;
}

/** Parsea las líneas NDJSON de Vercel y aplica los filtros. Pura: se testea sola. */
export function parseRuntimeLogs(
  text: string,
  filter: { levels?: string[]; path?: string; contains?: string; status_min?: number },
): RuntimeLogLine[] {
  const out: RuntimeLogLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let r: Row;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.source === 'delimiter') continue;
    const entry: RuntimeLogLine = {
      time: new Date(Number(r.timestampInMs) || 0).toISOString(),
      level: String(r.level ?? 'info'),
      source: String(r.source ?? ''),
      method: r.requestMethod || null,
      path: r.requestPath || null,
      status: r.responseStatusCode ? Number(r.responseStatusCode) : null,
      message: String(r.message ?? '').slice(0, 2000),
    };
    if (filter.levels?.length && !filter.levels.includes(entry.level)) continue;
    if (filter.path && !(entry.path ?? '').includes(filter.path)) continue;
    if (filter.contains && !entry.message.toLowerCase().includes(filter.contains.toLowerCase())) continue;
    if (filter.status_min && (entry.status ?? 0) < filter.status_min) continue;
    out.push(entry);
  }
  return out;
}

export async function getRuntimeLogs(_ctx: AdminContext, input: {
  deployment_id?: string; levels?: string[]; path?: string; contains?: string; status_min?: number;
  limit: number; wait_seconds: number;
}) {
  const cfg = vercelConfig();
  const deployment = input.deployment_id
    ? { id: input.deployment_id, url: null as string | null }
    : await latestProductionDeployment();

  // El endpoint es un stream que queda abierto: se lee unos segundos y se corta.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.wait_seconds * 1000);
  let text = '';
  try {
    const res = await fetch(
      vercelUrl(`/v1/projects/${encodeURIComponent(cfg.project)}/deployments/${encodeURIComponent(deployment.id)}/runtime-logs`),
      { headers: { Authorization: `Bearer ${cfg.token}` }, signal: controller.signal, cache: 'no-store' },
    );
    if (!res.ok) throw new ServiceError('provider_error', 502, `Vercel error ${res.status} reading runtime logs`).markReported();
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (text.length < 2_000_000) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (!controller.signal.aborted) {
      throw new ServiceError('provider_error', 502, `Vercel did not respond: ${err instanceof Error ? err.message : String(err)}`).markReported();
    }
    // Abortado por tiempo: se usa lo leído.
  } finally {
    clearTimeout(timer);
  }

  const lines = parseRuntimeLogs(text, input);
  return {
    deployment,
    read_seconds: input.wait_seconds,
    total_matching: lines.length,
    // Los más recientes primero.
    logs: lines.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, input.limit),
  };
}
