// ─── Servicio: autopilot ─────────────────────────────────────────────────────
//
// Reglas que generan un post con IA y lo programan en las cuentas de la marca
// según un calendario (diario, semanal…). Lo comparten /api/autopilot/** (UI y
// cron) y las herramientas del asistente (list_autopilot_rules,
// save_autopilot_rule, delete_autopilot_rule, run_autopilot_now).
//
// Las reglas son de una marca: se crean con brand_id, se listan por marca, y
// la ejecución usa el brand kit de esa marca y deja el contenido en ella.
// Antes la creación no guardaba brand_id (la lista filtraba por él, así que
// una regla nueva no aparecía) y la ejecución leía el kit por org_id.
//
// Gasto: una ejecución pedida por una persona (botón «Ejecutar ahora», API,
// MCP, chat) cobra 1 crédito de texto por regla con chargeOrThrow. El cron no
// cobra todavía (decisión de producto pendiente: si cobrara, el autopilot se
// pararía en silencio al acabarse los créditos).

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { generateContentText } from '@/lib/ai';
import { publishPost } from '@/lib/zernio';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow, msg } from '@/lib/services/errors';
import type { Frequency } from '@/types/automations';

const ROUTE = 'lib/services/autopilot';

export const AUTOPILOT_CHANNELS = ['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic'] as const;
export const AUTOPILOT_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export const AUTOPILOT_MODELS = ['claude', 'gpt'] as const;
/** Reglas que se pueden ejecutar a mano en una sola petición. */
export const MAX_MANUAL_RUN = 5;

type Db = ReturnType<typeof createSupabaseServer>;

export interface AutopilotRuleRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  created_by: string | null;
  name: string;
  channel: (typeof AUTOPILOT_CHANNELS)[number];
  social_account_ids: string[];
  frequency: Frequency;
  day_of_week: number | null;
  time_of_day: string;
  timezone: string;
  ai_model: 'claude' | 'gpt';
  tone: string | null;
  topic_hints: string[];
  status: 'active' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Calendario ──────────────────────────────────────────────────────────────

/** Próxima ejecución según el calendario de la regla. */
export function computeNextRun(
  frequency: Frequency,
  dayOfWeek: number | null,
  timeOfDay: string, // "HH:MM"
  timezone: string,
  after: Date = new Date(),
): Date {
  const [hh, mm] = timeOfDay.split(':').map(Number);

  const tzNow = new Date(
    new Date(after).toLocaleString('en-US', { timeZone: timezone }),
  );

  const candidate = new Date(after);
  candidate.setHours(hh, mm ?? 0, 0, 0);

  // Primero, pasar de «ahora».
  if (candidate <= after) {
    if (frequency === 'daily') {
      candidate.setDate(candidate.getDate() + 1);
    } else {
      candidate.setDate(candidate.getDate() + 7);
    }
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const targetDay = dayOfWeek ?? 1; // lunes por defecto
    while (candidate.getDay() !== targetDay) {
      candidate.setDate(candidate.getDate() + 1);
    }
    if (frequency === 'biweekly' && candidate <= after) {
      candidate.setDate(candidate.getDate() + 14);
    }
  } else if (frequency === 'monthly') {
    // El mismo día, el mes siguiente.
    const next = new Date(tzNow);
    next.setMonth(next.getMonth() + 1);
    next.setHours(hh, mm ?? 0, 0, 0);
    return next;
  }

  return candidate;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const autopilotRuleFields = {
  name: z.string().trim().min(1).max(100),
  channel: z.enum(AUTOPILOT_CHANNELS).describe('Network the post is written for.'),
  social_account_ids: z.array(z.string().uuid()).max(10)
    .describe('Connected accounts of this brand the posts are scheduled to (see list_social_accounts).'),
  frequency: z.enum(AUTOPILOT_FREQUENCIES),
  day_of_week: z.number().int().min(0).max(6).nullable().optional()
    .describe('0 = Sunday … 6 = Saturday. For weekly / biweekly.'),
  time_of_day: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'HH:MM').describe('Local time, HH:MM.'),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown IANA time zone').describe('IANA zone, e.g. America/Santiago.'),
  ai_model: z.enum(AUTOPILOT_MODELS),
  tone: z.string().trim().max(100).nullable().optional(),
  topic_hints: z.array(z.string().trim().min(1).max(200)).max(20)
    .describe('Seed topics; each run picks one at random.'),
};

const createSchema = z.object({
  ...autopilotRuleFields,
  frequency: autopilotRuleFields.frequency.default('weekly'),
  time_of_day: autopilotRuleFields.time_of_day.default('09:00'),
  timezone: autopilotRuleFields.timezone.default('UTC'),
  ai_model: autopilotRuleFields.ai_model.default('claude'),
  topic_hints: autopilotRuleFields.topic_hints.default([]),
}).strict();

const patchSchema = z.object({
  ...Object.fromEntries(Object.entries(autopilotRuleFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof autopilotRuleFields]: z.ZodOptional<(typeof autopilotRuleFields)[K]>
  },
  status: z.enum(['active', 'paused']).optional(),
}).strict();

const RULE_KEYS = [
  'name', 'channel', 'social_account_ids', 'frequency', 'day_of_week', 'time_of_day', 'timezone',
  'ai_model', 'tone', 'topic_hints',
] as const;

/**
 * Cuerpo de /api/autopilot/rules → entrada del servicio. Se queda con los
 * campos conocidos (la UI manda más), y `prompt_hint` —la pista de tema que
 * manda la UI y que no es una columna— pasa a `topic_hints`. Antes se
 * descartaba sin avisar.
 */
export function autopilotInputFromUiBody(body: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of RULE_KEYS) if (body[key] !== undefined) input[key] = body[key];
  if (input.topic_hints === undefined && typeof body.prompt_hint === 'string' && body.prompt_hint.trim()) {
    input.topic_hints = [body.prompt_hint.trim()];
  }
  if (typeof input.name === 'string') input.name = input.name.trim();
  return input;
}

export type AutopilotRuleInput = z.input<typeof createSchema>;
export type AutopilotRulePatch = z.input<typeof patchSchema>;

function parse<T extends z.ZodTypeAny>(ctx: ServiceContext, schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = z.flattenError(r.error);
    // El mismo formato que devolvía la ruta: los errores en una línea.
    const message = [
      ...issues.formErrors,
      ...Object.entries(issues.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`),
    ].join('; ') || msg(ctx.language, 'Entrada inválida', 'Invalid input');
    throw new ServiceError('invalid_input', 422, message, { error: message, issues });
  }
  return r.data;
}

function dbError(message: string, ctx: ServiceContext | null, error: { message: string }, extra?: Record<string, unknown>): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx?.auth, extra });
  return new ServiceError('unavailable', 500, message).markReported();
}

function notFound(ctx: ServiceContext): ServiceError {
  return new ServiceError('not_found', 404, msg(ctx.language, 'Regla no encontrada', 'Rule not found'));
}

/** Las cuentas tienen que ser de la marca de la regla (y de la org). */
async function assertAccountsInBrand(ctx: ServiceContext, db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const { data, error } = await db
    .from('kefy_social_accounts')
    .select('id')
    .in('id', unique)
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId);
  if (error) throw dbError('Failed to verify accounts', ctx, error);
  if ((data ?? []).length !== unique.length) {
    throw new ServiceError(
      'invalid_input',
      422,
      msg(ctx.language, 'Alguna cuenta no es de esta marca', 'Some accounts do not belong to this brand'),
    );
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** Reglas de la marca del contexto, las más nuevas primero. */
export async function listAutopilotRules(ctx: ServiceContext): Promise<AutopilotRuleRow[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('created_at', { ascending: false });
  if (error) throw dbError('Failed to fetch rules', ctx, error);
  return (data ?? []) as AutopilotRuleRow[];
}

/**
 * Una regla con sus últimas 10 ejecuciones. Con brandScope 'strict' tiene que
 * ser de la marca del contexto; con 'org' (la UI) basta con la org.
 */
export async function getAutopilotRule(
  ctx: ServiceContext,
  ruleId: string,
): Promise<AutopilotRuleRow & { kefy_autopilot_runs?: unknown[] }> {
  if (!z.string().uuid().safeParse(ruleId).success) throw notFound(ctx);
  const db = createSupabaseServer();
  let q = db
    .from('kefy_autopilot_rules')
    .select('*, kefy_autopilot_runs ( id, status, ran_at, content_item_id, error_message )')
    .eq('id', ruleId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);
  const { data, error } = await q
    .order('ran_at', { referencedTable: 'kefy_autopilot_runs', ascending: false })
    .limit(10, { referencedTable: 'kefy_autopilot_runs' })
    .maybeSingle();
  if (error) throw dbError('Failed to fetch rule', ctx, error);
  if (!data) throw notFound(ctx);
  return data as AutopilotRuleRow & { kefy_autopilot_runs?: unknown[] };
}

export async function createAutopilotRule(ctx: ServiceContext, input: unknown): Promise<AutopilotRuleRow> {
  const parsed = parse(ctx, createSchema, input);
  const db = createSupabaseServer();
  await assertAccountsInBrand(ctx, db, parsed.social_account_ids);

  const dayOfWeek = parsed.day_of_week ?? null;
  const nextRunAt = computeNextRun(parsed.frequency, dayOfWeek, parsed.time_of_day, parsed.timezone);

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .insert({
      org_id: ctx.auth.orgId,
      brand_id: ctx.brandId,
      created_by: ctx.auth.userId,
      name: parsed.name,
      channel: parsed.channel,
      social_account_ids: parsed.social_account_ids,
      frequency: parsed.frequency,
      day_of_week: dayOfWeek,
      time_of_day: parsed.time_of_day,
      timezone: parsed.timezone,
      ai_model: parsed.ai_model,
      tone: parsed.tone ?? null,
      topic_hints: parsed.topic_hints,
      status: 'active',
      next_run_at: nextRunAt.toISOString(),
    })
    .select()
    .single();
  if (error || !data) throw dbError('Failed to create rule', ctx, error ?? { message: 'no row' });
  return data as AutopilotRuleRow;
}

export async function updateAutopilotRule(
  ctx: ServiceContext,
  ruleId: string,
  input: unknown,
): Promise<AutopilotRuleRow> {
  const parsed = parse(ctx, patchSchema, input);
  const existing = await getAutopilotRule(ctx, ruleId);
  const db = createSupabaseServer();

  if (parsed.social_account_ids) {
    // Las cuentas se validan contra la marca de la regla, no la del contexto.
    await assertAccountsInBrand({ ...ctx, brandId: existing.brand_id ?? ctx.brandId }, db, parsed.social_account_ids);
  }

  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'channel', 'social_account_ids', 'ai_model', 'tone', 'topic_hints', 'status'] as const) {
    if (parsed[key] !== undefined) patch[key] = parsed[key];
  }

  const scheduleChanged =
    parsed.frequency !== undefined || parsed.day_of_week !== undefined ||
    parsed.time_of_day !== undefined || parsed.timezone !== undefined;
  // Reanudar una regla pausada también recalcula: su next_run_at quedó en el pasado.
  const resumed = parsed.status === 'active' && existing.status === 'paused';

  if (scheduleChanged || resumed) {
    const frequency = parsed.frequency ?? existing.frequency;
    const dayOfWeek = parsed.day_of_week !== undefined ? parsed.day_of_week : existing.day_of_week;
    const timeOfDay = parsed.time_of_day ?? existing.time_of_day;
    const timezone = parsed.timezone ?? existing.timezone;
    Object.assign(patch, {
      frequency,
      day_of_week: dayOfWeek ?? null,
      time_of_day: timeOfDay,
      timezone,
      next_run_at: computeNextRun(frequency, dayOfWeek ?? null, timeOfDay, timezone).toISOString(),
    });
  }

  if (Object.keys(patch).length === 0) {
    throw new ServiceError('invalid_input', 422, 'No updatable fields provided');
  }

  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .update(patch)
    .eq('id', ruleId)
    .eq('org_id', ctx.auth.orgId)
    .select()
    .single();
  if (error || !data) throw dbError('Failed to update rule', ctx, error ?? { message: 'no row' });
  return data as AutopilotRuleRow;
}

export async function deleteAutopilotRule(ctx: ServiceContext, ruleId: string): Promise<void> {
  await getAutopilotRule(ctx, ruleId);
  const db = createSupabaseServer();
  const { error } = await db
    .from('kefy_autopilot_rules')
    .delete()
    .eq('id', ruleId)
    .eq('org_id', ctx.auth.orgId);
  if (error) throw dbError('Failed to delete rule', ctx, error);
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

export interface AutopilotRunResult {
  rule_id: string;
  rule_name: string;
  status: 'success' | 'failed';
  content_item_id?: string;
  scheduled_post_ids?: string[];
  error?: string;
}

/**
 * Ejecuta una regla: genera el post con el brand kit de su marca, lo guarda en
 * esa marca y lo programa en sus cuentas activas. Registra la ejecución en
 * kefy_autopilot_runs y adelanta next_run_at. No cobra: quien llama decide.
 */
export async function executeAutopilotRule(
  db: Db,
  rule: AutopilotRuleRow,
  now: Date = new Date(),
): Promise<AutopilotRunResult> {
  try {
    const { data: brandKit } = rule.brand_id
      ? await db
          .from('kefy_brand_kits')
          .select('tone, tagline, industry, notes')
          .eq('brand_id', rule.brand_id)
          .maybeSingle()
      : { data: null };

    const topicHints: string[] = Array.isArray(rule.topic_hints) ? rule.topic_hints : [];
    const topicHint = topicHints.length > 0
      ? topicHints[Math.floor(Math.random() * topicHints.length)]
      : undefined;

    const generated = await generateContentText({
      channel: rule.channel,
      model: rule.ai_model === 'gpt' ? 'gpt' : 'claude',
      tone: rule.tone ? [rule.tone] : (brandKit?.tone ?? undefined),
      topic: topicHint ?? rule.name,
      tagline: brandKit?.tagline ?? undefined,
      extraCtx: brandKit?.notes ?? undefined,
    });

    const { data: contentItem, error: contentError } = await db
      .from('kefy_content_items')
      .insert({
        org_id: rule.org_id,
        brand_id: rule.brand_id,
        channel: rule.channel,
        body: generated.body,
        hashtags: generated.hashtags,
        status: 'approved',
        metadata: { autopilot: true, rule_id: rule.id, model: rule.ai_model },
        created_by: null,
      })
      .select('id')
      .single();
    if (contentError || !contentItem) throw new Error(contentError?.message ?? 'Failed to create content item');

    let accountsQ = db
      .from('kefy_social_accounts')
      .select('id, zernio_account_id, platform')
      .in('id', rule.social_account_ids)
      .eq('org_id', rule.org_id)
      .eq('status', 'active');
    if (rule.brand_id) accountsQ = accountsQ.eq('brand_id', rule.brand_id);
    const { data: accounts } = await accountsQ;

    // Se programa para el hueco de la regla (next_run_at), también al
    // ejecutarla a mano: «Ejecutar ahora» genera ya y adelanta el calendario.
    const scheduledAt = rule.next_run_at ?? now.toISOString();
    const scheduledPostIds: string[] = [];
    for (const account of (accounts ?? []) as Array<{ id: string; zernio_account_id: string | null; platform: string }>) {
      try {
        const zResult = await publishPost({
          account_id: account.zernio_account_id!,
          platform: account.platform,
          text: generated.body,
          hashtags: generated.hashtags,
          scheduled_at: scheduledAt,
        });

        const { data: sp } = await db
          .from('kefy_scheduled_posts')
          .insert({
            org_id: rule.org_id,
            brand_id: rule.brand_id,
            content_item_id: contentItem.id,
            social_account_id: account.id,
            scheduled_at: scheduledAt,
            zernio_post_id: zResult.post_id,
            platform_post_id: zResult.platform_post_id ?? null,
            status: 'scheduled',
            created_by: null,
          })
          .select('id')
          .single();
        if (sp) scheduledPostIds.push(sp.id);
      } catch (accountErr) {
        reportError(accountErr, {
          route: ROUTE, service: 'zernio', extra: { ruleId: rule.id, accountId: account.id },
        });
      }
    }

    await db.from('kefy_content_items').update({ status: 'scheduled' }).eq('id', contentItem.id);

    const nextRun = computeNextRun(rule.frequency, rule.day_of_week ?? null, rule.time_of_day, rule.timezone, now);
    await db
      .from('kefy_autopilot_rules')
      .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
      .eq('id', rule.id);

    await db.from('kefy_autopilot_runs').insert({
      rule_id: rule.id,
      org_id: rule.org_id,
      brand_id: rule.brand_id,
      content_item_id: contentItem.id,
      scheduled_post_ids: scheduledPostIds,
      status: 'success',
    });

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      status: 'success',
      content_item_id: contentItem.id,
      scheduled_post_ids: scheduledPostIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: rule.id, orgId: rule.org_id } });

    await db.from('kefy_autopilot_runs').insert({
      rule_id: rule.id,
      org_id: rule.org_id,
      brand_id: rule.brand_id,
      status: 'failed',
      error_message: message,
    });

    return { rule_id: rule.id, rule_name: rule.name, status: 'failed', error: message };
  }
}

export interface AutopilotRunSummary {
  executed: number;
  failed: number;
  results: AutopilotRunResult[];
}

function summarize(results: AutopilotRunResult[]): AutopilotRunSummary {
  const executed = results.filter((r) => r.status === 'success').length;
  return { executed, failed: results.length - executed, results };
}

/**
 * Ejecución pedida por una persona (UI, API, MCP, chat). Con `ruleIds`, esas
 * reglas (como mucho MAX_MANUAL_RUN); sin ellos, las vencidas de la org.
 * Siempre activas, de la org, y de la marca con brandScope 'strict'.
 *
 * Cobra 1 crédito de texto por regla antes de generar y lo devuelve si la
 * ejecución falla. Si los créditos o la suscripción cortan a mitad, las
 * reglas que ya corrieron se conservan en el resultado; si cortan en la
 * primera, se lanza el error de la guardia (402 / 429).
 */
export async function runAutopilotNow(
  ctx: ServiceContext,
  ruleIds: string[] | null,
  route: string,
  now: Date = new Date(),
): Promise<AutopilotRunSummary> {
  const ids = ruleIds ? [...new Set(ruleIds)].filter((id) => z.string().uuid().safeParse(id).success) : null;
  if (ids && ids.length > MAX_MANUAL_RUN) {
    throw new ServiceError(
      'invalid_input',
      422,
      msg(ctx.language, `Como mucho ${MAX_MANUAL_RUN} reglas a la vez`, `At most ${MAX_MANUAL_RUN} rules at once`),
    );
  }
  if (ids && ids.length === 0) return summarize([]);

  const db = createSupabaseServer();
  let q = db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'active');
  q = ids ? q.in('id', ids) : q.lte('next_run_at', now.toISOString());
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);
  const { data: rules, error } = await q;
  if (error) throw dbError('Failed to fetch rules', ctx, error);

  const results: AutopilotRunResult[] = [];
  for (const rule of (rules ?? []) as AutopilotRuleRow[]) {
    let refund: () => Promise<void>;
    try {
      refund = await chargeOrThrow(ctx, 'text', route);
    } catch (err) {
      if (results.length === 0) throw err;
      const message = err instanceof Error ? err.message : 'Blocked';
      results.push({ rule_id: rule.id, rule_name: rule.name, status: 'failed', error: message });
      continue;
    }
    const result = await executeAutopilotRule(db, rule, now);
    if (result.status === 'failed') await refund();
    results.push(result);
  }
  return summarize(results);
}

/**
 * Cron: reglas activas vencidas de todas las orgs, o las `ruleIds` pedidas con
 * el secreto del cron. No cobra (ver cabecera).
 */
export async function runScheduledAutopilot(
  ruleIds: string[] | null,
  now: Date = new Date(),
): Promise<AutopilotRunSummary> {
  const db = createSupabaseServer();
  let q = db.from('kefy_autopilot_rules').select('*').eq('status', 'active');
  q = ruleIds?.length ? q.in('id', ruleIds) : q.lte('next_run_at', now.toISOString());
  const { data: rules, error } = await q;
  if (error) throw dbError('Failed to fetch rules', null, error);

  const results: AutopilotRunResult[] = [];
  for (const rule of (rules ?? []) as AutopilotRuleRow[]) {
    results.push(await executeAutopilotRule(db, rule, now));
  }
  return summarize(results);
}
