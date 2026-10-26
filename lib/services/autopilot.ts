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
// Cada ejecución genera la pieza con su media (post con imagen, carrusel o
// reel en video) por los mismos servicios que la UI, y la publica. Ver la
// sección «Ejecución».
//
// Gasto: los servicios cobran cada operación (texto, imágenes, video) con la
// guardia de siempre, también en el cron: sin eso, el autopilot generaría
// imágenes y videos sin límite. Antes de gastar se comprueba que alcancen la
// suscripción y los créditos; si no, la ejecución queda registrada como
// fallida y la regla sigue con su calendario.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { checkSubscription } from '@/lib/subscription';
import { costOf, getUsage } from '@/lib/usage';
import { serviceContext, type ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { generateCarousel, generateImageForItem, generateTextPost } from '@/lib/services/content';
import { REEL_SCENE_COUNT_MAX, REEL_SCENE_COUNT_MIN, generateReel } from '@/lib/services/reel';
import { produceVideo } from '@/lib/services/video';
import { publishContent } from '@/lib/services/publish';
import type { JWTPayload } from '@/types/auth';
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
//
// Cada ejecución produce una pieza con media, por los mismos servicios que la
// UI: un post lleva su imagen, un carrusel una imagen por slide y un reel es un
// video producido por el pipeline (docs/video-pipeline.md). Antes solo se
// generaba texto y se programaba sin media: TikTok e Instagram lo publicaban
// como una imagen con puro texto.
//
// El formato sale de la etiqueta del tema elegido ([REEL 30s], [CARRUSEL 5
// slides], [POST]). Sin etiqueta: reel si todas las cuentas son de video
// (TikTok, YouTube) y post con imagen en el resto.
//
// Un reel tarda minutos en producirse: la ejecución deja la pieza esperando
// (`metadata.autopilot_publish`) y el cron la publica cuando el video está
// listo (publishReadyAutopilotReels).

export const AUTOPILOT_FORMATS = ['post', 'carousel', 'reel'] as const;
export type AutopilotFormat = (typeof AUTOPILOT_FORMATS)[number];

/** Redes donde un post sin video no tiene sentido: el formato por defecto es reel. */
const VIDEO_FIRST_PLATFORMS = new Set(['tiktok', 'youtube']);
const FORMAT_TAG = /^\s*\[([^\]]*)\]\s*/;
/** Un plano de reel dura ~5 s: «[REEL 30s]» son 6 planos. */
const SECONDS_PER_SCENE = 5;
/** Más cerca que esto del hueco, se publica ya en vez de programar. */
const MIN_SCHEDULE_LEAD_MS = 60 * 1000;
/** Un reel que no terminó de producirse en este tiempo no se publica. */
const REEL_WAIT_TIMEOUT_MS = 6 * 60 * 60 * 1000;
/** El cron no empieza otra regla pasado esto: generar media tarda (maxDuration 300 s). */
const CRON_RUN_BUDGET_MS = 200 * 1000;
const MAX_PENDING_REELS_PER_RUN = 10;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

export interface AutopilotTopic {
  /** null: el tema no lo dice; decide la red (defaultAutopilotFormat). */
  format: AutopilotFormat | null;
  topic: string;
  slideCount?: number;
  sceneCount?: number;
}

/** «[REEL 30s] Tip…» → { format: 'reel', topic: 'Tip…', sceneCount: 6 }. */
export function parseAutopilotTopic(raw: string): AutopilotTopic {
  const m = FORMAT_TAG.exec(raw);
  if (!m) return { format: null, topic: raw.trim() };
  const tag = m[1].toLowerCase();
  const topic = raw.slice(m[0].length).trim() || raw.trim();
  const num = (re: RegExp) => {
    const n = re.exec(tag);
    return n ? Number(n[1]) : undefined;
  };

  if (/\b(reels?|videos?|shorts?)\b/.test(tag)) {
    const seconds = num(/(\d+)\s*(?:s|seg|sec)/);
    return {
      format: 'reel',
      topic,
      sceneCount: seconds ? clamp(seconds / SECONDS_PER_SCENE, REEL_SCENE_COUNT_MIN, REEL_SCENE_COUNT_MAX) : undefined,
    };
  }
  if (/\b(carrusel|carousel)\b/.test(tag)) {
    const slides = num(/(\d+)/);
    return { format: 'carousel', topic, slideCount: slides ? clamp(slides, 3, 10) : undefined };
  }
  if (/\b(post|imagen|image|foto|photo)\b/.test(tag)) return { format: 'post', topic };
  // Una etiqueta que no es de formato es parte del tema.
  return { format: null, topic: raw.trim() };
}

export function defaultAutopilotFormat(platforms: string[]): AutopilotFormat {
  return platforms.length > 0 && platforms.every((p) => VIDEO_FIRST_PLATFORMS.has(p)) ? 'reel' : 'post';
}

/**
 * Créditos que cuesta una ejecución en ese formato. El reel es la estimación
 * del plan con animación `key` (docs/video-pipeline.md, «Costo») más el guion.
 */
export function estimateAutopilotCredits(
  format: AutopilotFormat,
  opts: { slideCount?: number; sceneCount?: number } = {},
): number {
  if (format === 'post') return costOf('text') + costOf('image');
  if (format === 'carousel') return costOf('text') + costOf('image') * (opts.slideCount ?? 5);
  const scenes = opts.sceneCount ?? 5;
  return costOf('text')
    + scenes * (costOf('image') + costOf('voice'))
    + Math.min(3, scenes) * costOf('animation')
    + costOf('video');
}

type AccountRow = { id: string; zernio_account_id: string | null; platform: string };

async function activeAccounts(db: Db, rule: AutopilotRuleRow): Promise<AccountRow[]> {
  if (rule.social_account_ids.length === 0) return [];
  let q = db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, platform')
    .in('id', rule.social_account_ids)
    .eq('org_id', rule.org_id)
    .eq('status', 'active');
  if (rule.brand_id) q = q.eq('brand_id', rule.brand_id);
  const { data } = await q;
  return (data ?? []) as AccountRow[];
}

/**
 * Lo más caro que puede costar una ejecución de la regla (cada una elige un
 * tema al azar). Es lo que la tarjeta de confirmación del chat anuncia.
 */
export async function estimateAutopilotRuleCredits(rule: AutopilotRuleRow): Promise<number> {
  const db = createSupabaseServer();
  const fallback = defaultAutopilotFormat((await activeAccounts(db, rule)).map((a) => a.platform));
  const topics = rule.topic_hints.length > 0 ? rule.topic_hints.map(parseAutopilotTopic) : [parseAutopilotTopic(rule.name)];
  return Math.max(...topics.map((t) => estimateAutopilotCredits(t.format ?? fallback, t)));
}

/**
 * Identidad con la que corre una regla. Una persona («Ejecutar ahora») usa la
 * suya; el cron, la de quien creó la regla (o el owner) con el plan de la
 * organización, como lib/engagement-executor. Los servicios cobran a la org
 * con la misma guardia que la UI (suscripción → rate limit → créditos).
 */
async function ruleContext(db: Db, rule: AutopilotRuleRow, base?: ServiceContext): Promise<ServiceContext> {
  const { data: kit } = rule.brand_id
    ? await db.from('kefy_brand_kits').select('language').eq('brand_id', rule.brand_id).maybeSingle()
    : { data: null };
  const language: 'es' | 'en' = kit?.language === 'en' ? 'en' : kit?.language === 'es' ? 'es' : (base?.language ?? 'es');

  if (base) return { ...base, brandId: rule.brand_id ?? base.brandId, language };

  const { data: org } = await db.from('kefy_organizations').select('plan').eq('id', rule.org_id).maybeSingle();
  const plan = (org?.plan as JWTPayload['plan'] | undefined) ?? 'starter';

  let userId = rule.created_by;
  if (!userId) {
    const { data: owner } = await db
      .from('kefy_org_memberships')
      .select('user_id')
      .eq('org_id', rule.org_id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    userId = (owner?.user_id as string | undefined) ?? null;
  }
  if (!userId) throw new Error('La organización no tiene owner con quien ejecutar la regla');

  return serviceContext({ userId, orgId: rule.org_id, role: 'owner', plan }, rule.brand_id ?? '', language, {
    brandScope: 'org', source: 'route',
  });
}

/**
 * ¿Alcanza la suscripción y el saldo para esta ejecución? Se mira antes de
 * gastar nada: un post a medias (texto sin imagen) es justo lo que no se
 * quiere publicar.
 */
async function preflight(ctx: ServiceContext, credits: number): Promise<ServiceError | null> {
  const sub = await checkSubscription(ctx.auth.orgId, ctx.language);
  if (!sub.ok) {
    return new ServiceError(sub.status === 402 ? 'subscription_required' : 'unavailable', sub.status, String(sub.body.error), sub.body);
  }
  const usage = await getUsage(ctx.auth.orgId, ctx.auth.plan);
  if (usage.remaining < credits) {
    const message = msg(ctx.language,
      `Esta publicación necesita ${credits} créditos y te quedan ${usage.remaining}.`,
      `This post needs ${credits} credits and you have ${usage.remaining} left.`);
    return new ServiceError('credits_exhausted', 429, message, {
      error: message, creditsExhausted: true, required: credits, remaining: usage.remaining,
    });
  }
  return null;
}

/**
 * Reclama el hueco: adelanta next_run_at solo si nadie lo hizo antes. Dos
 * vueltas del cron que se pisan no generan la misma regla dos veces, y una
 * ejecución fallida no se reintenta cada 5 minutos gastando otra vez.
 */
async function claimSlot(db: Db, rule: AutopilotRuleRow, now: Date): Promise<boolean> {
  const nextRun = computeNextRun(rule.frequency, rule.day_of_week ?? null, rule.time_of_day, rule.timezone, now);
  let q = db
    .from('kefy_autopilot_rules')
    .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
    .eq('id', rule.id);
  q = rule.next_run_at ? q.eq('next_run_at', rule.next_run_at) : q.is('next_run_at', null);
  const { data } = await q.select('id');
  return (data ?? []).length > 0;
}

async function mergeItemMetadata(db: Db, itemId: string, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { data } = await db.from('kefy_content_items').select('metadata').eq('id', itemId).maybeSingle();
  const metadata = { ...((data?.metadata as Record<string, unknown> | null) ?? {}), ...patch };
  await db.from('kefy_content_items').update({ metadata, ...extra }).eq('id', itemId);
}

/** Publica la pieza en el hueco (o ya, si el hueco pasó). Devuelve los ids programados. */
async function publishToAccounts(
  ctx: ServiceContext,
  itemId: string,
  format: AutopilotFormat,
  accountIds: string[],
  slot: string | null,
): Promise<string[]> {
  const scheduled = !!slot && new Date(slot).getTime() > Date.now() + MIN_SCHEDULE_LEAD_MS;
  const { body } = await publishContent(ctx, {
    itemId,
    accountIds,
    format,
    mode: scheduled ? 'schedule' : 'now',
    scheduledAt: scheduled ? new Date(slot!).toISOString() : undefined,
  });
  const ok = body.results.filter((r) => r.status !== 'failed');
  if (ok.length === 0) throw new Error(body.results.find((r) => r.error)?.error ?? 'Publish failed');
  return ok.map((r) => r.scheduled_post_id).filter((id): id is string => !!id);
}

/** Genera la pieza con su media. Devuelve el id; un reel queda produciéndose. */
async function produceItem(ctx: ServiceContext, rule: AutopilotRuleRow, pick: AutopilotTopic, format: AutopilotFormat): Promise<string> {
  const topic = rule.tone ? `${pick.topic}\n(${msg(ctx.language, 'Tono', 'Tone')}: ${rule.tone})` : pick.topic;
  const channel = rule.channel;

  if (format === 'post') {
    const { itemId, result } = await generateTextPost(ctx, {
      topic, channel, model: rule.ai_model === 'gpt' ? 'gpt' : 'claude',
    });
    if (!itemId) throw new Error('Failed to save content item');
    try {
      // El mismo prompt que usa la UI para la imagen de un post: su texto.
      await generateImageForItem(ctx, { itemId, prompt: result.body.slice(0, 400) || pick.topic });
    } catch (err) {
      throw withItem(err, itemId);
    }
    return itemId;
  }

  if (format === 'carousel') {
    const out = await generateCarousel(ctx, { topic, channel, slideCount: pick.slideCount });
    if (!out.itemId) throw new Error('Failed to save carousel');
    // Slides sin imagen se publicarían como texto sobre un fondo: no.
    if (out.slides.some((s) => !s.image_url)) {
      throw withItem(new Error(msg(ctx.language,
        'El carrusel quedó con slides sin imagen; queda como borrador.',
        'Some carousel slides have no image; it stays as a draft.')), out.itemId);
    }
    return out.itemId;
  }

  const out = await generateReel(ctx, { topic, channel, scene_count: pick.sceneCount });
  const itemId = out.variants[0]!.itemId;
  try {
    await produceVideo(ctx, { itemId });
  } catch (err) {
    throw withItem(err, itemId);
  }
  return itemId;
}

/** Un fallo que deja una pieza a medias: se anota en la ejecución para encontrarla. */
function withItem(err: unknown, itemId: string): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  (e as Error & { itemId?: string }).itemId = itemId;
  return e;
}

export interface AutopilotRunResult {
  rule_id: string;
  rule_name: string;
  status: 'success' | 'failed';
  format?: AutopilotFormat;
  content_item_id?: string;
  scheduled_post_ids?: string[];
  /** Reel: se publica cuando el video esté listo. */
  pending_video?: boolean;
  error?: string;
}

export interface ExecuteOptions {
  /** Contexto de la persona que lo pidió. Sin él, es el cron. */
  ctx?: ServiceContext;
  /** Si no alcanzan los créditos o la suscripción, lanzar en vez de registrar el fallo. */
  throwIfBlocked?: boolean;
}

/**
 * Ejecuta una regla: genera la pieza con su media en la marca de la regla, la
 * publica en sus cuentas activas para el hueco de la regla (un reel, cuando
 * su video esté listo) y adelanta next_run_at. Registra la ejecución en
 * kefy_autopilot_runs. Cobra por los servicios, como la UI.
 */
export async function executeAutopilotRule(
  db: Db,
  rule: AutopilotRuleRow,
  now: Date = new Date(),
  opts: ExecuteOptions = {},
): Promise<AutopilotRunResult> {
  const base = { rule_id: rule.id, rule_name: rule.name };
  const fail = async (message: string, itemId?: string): Promise<AutopilotRunResult> => {
    await db.from('kefy_autopilot_runs').insert({
      rule_id: rule.id, org_id: rule.org_id, brand_id: rule.brand_id,
      content_item_id: itemId ?? null, status: 'failed', error_message: message,
    });
    return { ...base, status: 'failed', content_item_id: itemId, error: message };
  };

  let ctx: ServiceContext;
  let accounts: AccountRow[];
  try {
    ctx = await ruleContext(db, rule, opts.ctx);
    accounts = await activeAccounts(db, rule);
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: rule.id, orgId: rule.org_id } });
    return { ...base, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' };
  }

  const topicHints: string[] = Array.isArray(rule.topic_hints) ? rule.topic_hints : [];
  const pick = parseAutopilotTopic(
    topicHints.length > 0 ? topicHints[Math.floor(Math.random() * topicHints.length)] : rule.name,
  );
  const format = pick.format ?? defaultAutopilotFormat(accounts.map((a) => a.platform));

  const blocked = accounts.length === 0
    ? new ServiceError('invalid_input', 422, msg(ctx.language,
      'La regla no tiene cuentas activas donde publicar.', 'The rule has no active accounts to post to.'))
    : await preflight(ctx, estimateAutopilotCredits(format, pick));
  if (blocked && opts.throwIfBlocked) throw blocked;

  // Se reclama el hueco antes de gastar: si otra vuelta ya lo tomó, nada.
  const slot = rule.next_run_at;
  if (!(await claimSlot(db, rule, now))) return { ...base, status: 'failed', error: 'Already running' };
  if (blocked) return fail(blocked.message);

  let itemId: string | undefined;
  try {
    itemId = await produceItem(ctx, rule, pick, format);
    const autopilotMeta = { autopilot: true, rule_id: rule.id, model: rule.ai_model, autopilot_format: format };

    if (format === 'reel') {
      const { data: run } = await db.from('kefy_autopilot_runs').insert({
        rule_id: rule.id, org_id: rule.org_id, brand_id: rule.brand_id,
        content_item_id: itemId, scheduled_post_ids: [], status: 'success',
      }).select('id').single();
      await mergeItemMetadata(db, itemId, {
        ...autopilotMeta,
        autopilot_publish: {
          status: 'waiting',
          rule_id: rule.id,
          run_id: (run as { id?: string } | null)?.id ?? null,
          account_ids: accounts.map((a) => a.id),
          scheduled_at: slot ?? now.toISOString(),
          requested_at: now.toISOString(),
        },
      }, { status: 'approved' });
      return { ...base, status: 'success', format, content_item_id: itemId, scheduled_post_ids: [], pending_video: true };
    }

    await mergeItemMetadata(db, itemId, autopilotMeta, { status: 'approved', content_type: format });
    const scheduledPostIds = await publishToAccounts(ctx, itemId, format, accounts.map((a) => a.id), slot);

    await db.from('kefy_autopilot_runs').insert({
      rule_id: rule.id, org_id: rule.org_id, brand_id: rule.brand_id,
      content_item_id: itemId, scheduled_post_ids: scheduledPostIds, status: 'success',
    });
    return { ...base, status: 'success', format, content_item_id: itemId, scheduled_post_ids: scheduledPostIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (!(err instanceof ServiceError && err.reported)) {
      reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: rule.id, orgId: rule.org_id, format } });
    }
    return fail(message, itemId ?? (err as { itemId?: string }).itemId);
  }
}

type PendingPublish = {
  status: 'waiting' | 'publishing' | 'done' | 'failed' | 'cancelled';
  rule_id: string;
  run_id: string | null;
  account_ids: string[];
  scheduled_at: string;
  requested_at: string;
  error?: string;
};

/**
 * Publica los reels del autopilot cuyo video ya está listo, y cierra los que
 * no van a estarlo (la producción falló o lleva demasiado). Lo llama el cron.
 */
export async function publishReadyAutopilotReels(now: Date = new Date()): Promise<AutopilotRunResult[]> {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_content_items')
    .select('id, org_id, render_status, video_url, metadata')
    .eq('metadata->autopilot_publish->>status', 'waiting')
    .limit(MAX_PENDING_REELS_PER_RUN);

  const results: AutopilotRunResult[] = [];
  for (const item of (data ?? []) as Array<{
    id: string; org_id: string; render_status: string | null; video_url: string | null; metadata: Record<string, unknown>;
  }>) {
    const pending = item.metadata.autopilot_publish as PendingPublish;
    const ready = item.render_status === 'ready' && !!item.video_url;
    const timedOut = now.getTime() - new Date(pending.requested_at).getTime() > REEL_WAIT_TIMEOUT_MS;
    if (!ready && item.render_status === 'rendering' && !timedOut) continue;

    // Reclamo: solo una vuelta pasa de 'waiting' a 'publishing'.
    const { data: claimed } = await db
      .from('kefy_content_items')
      .update({ metadata: { ...item.metadata, autopilot_publish: { ...pending, status: 'publishing' } } })
      .eq('id', item.id)
      .eq('metadata->autopilot_publish->>status', 'waiting')
      .select('id');
    if (!claimed?.length) continue;

    const { data: rule } = await db.from('kefy_autopilot_rules').select('*').eq('id', pending.rule_id).maybeSingle();
    const ruleRow = rule as AutopilotRuleRow | null;
    const base = { rule_id: pending.rule_id, rule_name: ruleRow?.name ?? '', format: 'reel' as const, content_item_id: item.id };

    const close = async (status: PendingPublish['status'], patch: { error?: string; scheduled_post_ids?: string[] }) => {
      await mergeItemMetadata(db, item.id, { autopilot_publish: { ...pending, status, ...(patch.error ? { error: patch.error } : {}) } });
      if (!pending.run_id) return;
      await db.from('kefy_autopilot_runs').update(patch.error
        ? { status: 'failed', error_message: patch.error }
        : { scheduled_post_ids: patch.scheduled_post_ids ?? [] }).eq('id', pending.run_id);
    };

    if (!ruleRow) {
      // La regla se borró mientras se producía: el video queda en la biblioteca.
      await close('cancelled', { error: 'Rule deleted' });
      continue;
    }
    if (!ready) {
      const error = timedOut ? 'El video no terminó de producirse a tiempo' : 'La producción del video falló';
      await close('failed', { error });
      results.push({ ...base, status: 'failed', error });
      continue;
    }

    try {
      const ctx = await ruleContext(db, ruleRow);
      const ids = await publishToAccounts(ctx, item.id, 'reel', pending.account_ids, pending.scheduled_at);
      await close('done', { scheduled_post_ids: ids });
      results.push({ ...base, status: 'success', scheduled_post_ids: ids });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Publish failed';
      reportError(err, { route: ROUTE, service: 'zernio', extra: { itemId: item.id, ruleId: pending.rule_id } });
      await close('failed', { error });
      results.push({ ...base, status: 'failed', error });
    }
  }
  return results;
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
 * Cobra lo que cuesta cada formato (texto, imágenes, video) por los
 * servicios. Antes de gastar mira que alcancen la suscripción y los créditos:
 * si no alcanzan para la primera regla se lanza el error (402 / 429); para
 * las siguientes, esas quedan como fallidas y las que corrieron se conservan.
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
    try {
      results.push(await executeAutopilotRule(db, rule, now, { ctx, throwIfBlocked: true }));
    } catch (err) {
      if (results.length === 0) throw err;
      const message = err instanceof Error ? err.message : 'Blocked';
      results.push({ rule_id: rule.id, rule_name: rule.name, status: 'failed', error: message });
    }
  }
  return summarize(results);
}

/**
 * Cron: primero publica los reels que ya terminaron; después ejecuta las
 * reglas activas vencidas de todas las orgs (o las `ruleIds` pedidas con el
 * secreto del cron). Cobra a cada org como la UI; sin saldo, la ejecución
 * queda registrada como fallida y la regla sigue con su calendario.
 */
export async function runScheduledAutopilot(
  ruleIds: string[] | null,
  now: Date = new Date(),
): Promise<AutopilotRunSummary> {
  const startedAt = Date.now();
  const results: AutopilotRunResult[] = await publishReadyAutopilotReels(now);

  const db = createSupabaseServer();
  let q = db.from('kefy_autopilot_rules').select('*').eq('status', 'active');
  q = ruleIds?.length ? q.in('id', ruleIds) : q.lte('next_run_at', now.toISOString());
  const { data: rules, error } = await q.order('next_run_at', { ascending: true });
  if (error) throw dbError('Failed to fetch rules', null, error);

  for (const rule of (rules ?? []) as AutopilotRuleRow[]) {
    // Las que no alcanzan siguen vencidas: las toma la próxima vuelta.
    if (Date.now() - startedAt > CRON_RUN_BUDGET_MS) break;
    results.push(await executeAutopilotRule(db, rule, now));
  }
  return summarize(results);
}
