// ─── Servicio: autopilot ─────────────────────────────────────────────────────
//
// Reglas que generan una pieza con IA y la programan en las cuentas de la
// marca según un calendario (diario, semanal…). Lo comparten /api/autopilot/**
// (UI y cron) y las herramientas del asistente (list_autopilot_rules,
// save_autopilot_rule, delete_autopilot_rule, run_autopilot_now).
//
// Las reglas son de una marca: se crean con brand_id, se listan por marca, y
// la ejecución usa el brand kit de esa marca y deja el contenido en ella.
//
// Cada ejecución genera la pieza con su media por los mismos servicios que la
// UI y el asistente (create_post, create_carousel, create_story, create_reel +
// produce_video) y la publica. El formato lo decide la regla (`format`, y la
// mezcla semanal `weekly_formats`); sin formato fijo, la etiqueta del tema o la
// red, como antes (lib/autopilot-formats.ts). Con `also_story`, cada pieza
// trae además su story derivada (convert_content_format), `story_delay_minutes`
// después. Ver la sección «Ejecución».
//
// Gasto: los servicios cobran cada operación (texto, imágenes, video) con la
// guardia de siempre, también en el cron: sin eso, el autopilot generaría
// imágenes y videos sin límite. Antes de gastar se comprueba que alcancen la
// suscripción y los créditos de la ejecución entera (pieza + story). Si en el
// cron no alcanzan los créditos, la regla se PAUSA (paused_reason
// 'credits_exhausted'), se avisa por correo y se reanuda sola al renovarse el
// mes; antes fallaba en cada hueco sin que nadie se enterara.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { checkSubscription } from '@/lib/subscription';
import { getUsage } from '@/lib/usage';
import { sendAutopilotAlert } from '@/lib/autopilot-alerts';
import {
  AUTOPILOT_FORMATS, STORY_DELAY_DEFAULT_MINUTES, STORY_DELAY_MAX_MINUTES, STORY_PLATFORMS, WEEKDAY_SKIP,
  WEEKLY_FORMAT_VALUES, autopilotRuleCost, estimateFormatCredits, estimateRunCredits, missingAutopilotMedia,
  nextRunForRule, parseAutopilotTopic, resolveRunFormat, usesStory,
  type AutopilotFormat, type AutopilotMediaRow, type RuleCost, type RuleCostInput, type WeeklyFormats,
} from '@/lib/autopilot-formats';
import { serviceContext, type ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { generateCarousel, generateImageForItem, generateTextPost } from '@/lib/services/content';
import { generateReel } from '@/lib/services/reel';
import { generateStory } from '@/lib/services/story';
import { generateRendition } from '@/lib/services/renditions';
import { produceVideo } from '@/lib/services/video';
import { publishContent } from '@/lib/services/publish';
import type { JWTPayload } from '@/types/auth';
import type { AutopilotLastRun, Frequency } from '@/types/automations';

export type { AutopilotLastRun } from '@/types/automations';

export {
  AUTOPILOT_FORMATS, computeNextRun, defaultAutopilotFormat, parseAutopilotTopic,
  type AutopilotFormat, type AutopilotTopic,
} from '@/lib/autopilot-formats';
/** Créditos de generar una pieza en ese formato (sin story derivada). */
export const estimateAutopilotCredits = estimateFormatCredits;

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
  /** null: automático (etiqueta del tema o red). */
  format: AutopilotFormat | null;
  weekly_formats: WeeklyFormats | null;
  also_story: boolean;
  story_delay_minutes: number;
  status: 'active' | 'paused';
  /** Por qué la pausó el sistema; null si la pausó una persona (o está activa). */
  paused_reason: 'credits_exhausted' | 'no_accounts' | null;
  paused_at: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Las columnas nuevas pueden faltar en filas leídas antes de la migración. */
function withDefaults<T extends Partial<AutopilotRuleRow>>(row: T): T & AutopilotRuleRow {
  return {
    format: null,
    weekly_formats: null,
    also_story: false,
    story_delay_minutes: STORY_DELAY_DEFAULT_MINUTES,
    paused_reason: null,
    paused_at: null,
    ...row,
  } as T & AutopilotRuleRow;
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

const weeklyValue = z.enum(WEEKLY_FORMAT_VALUES).optional();

export const autopilotRuleFields = {
  name: z.string().trim().min(1).max(100),
  channel: z.enum(AUTOPILOT_CHANNELS).describe('Network the post is written for.'),
  social_account_ids: z.array(z.string().uuid()).max(10)
    .describe('Connected accounts of this brand the posts are scheduled to (see list_social_accounts).'),
  frequency: z.enum(AUTOPILOT_FREQUENCIES),
  day_of_week: z.number().int().min(0).max(6).nullable().optional()
    .describe('0 = Sunday … 6 = Saturday. For weekly / biweekly.'),
  time_of_day: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'HH:MM').describe('Local time in `timezone`, HH:MM.'),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown IANA time zone').describe('IANA zone, e.g. America/Santiago.'),
  ai_model: z.enum(AUTOPILOT_MODELS),
  tone: z.string().trim().max(100).nullable().optional(),
  topic_hints: z.array(z.string().trim().min(1).max(200)).max(20)
    .describe('Seed topics; each run picks one at random.'),
  format: z.enum(AUTOPILOT_FORMATS).nullable()
    .describe(
      'What every run generates: "post" (create_post, text + image), "carousel" (create_carousel), "story" ' +
      '(create_story, vertical image; only published to Instagram, Facebook and Snapchat accounts) or "reel" ' +
      '(create_reel + produce_video; published once the video is ready). null = automatic: a topic tag like ' +
      '[REEL 30s] decides, otherwise reel for TikTok/YouTube-only rules and post for the rest.',
    ),
  weekly_formats: z.object({
    0: weeklyValue, 1: weeklyValue, 2: weeklyValue, 3: weeklyValue, 4: weeklyValue, 5: weeklyValue, 6: weeklyValue,
  }).strict().nullable()
    .describe(
      'Weekly mix, only for frequency "daily": weekday (0 = Sunday … 6 = Saturday) → format, or "skip" for no ' +
      'post that day. Days not listed use `format`. E.g. format "post" + {"4": "reel"} = a post every day and a ' +
      'reel on Thursdays; {"0": "skip", "6": "skip"} = weekdays only. null removes the mix.',
    ),
  also_story: z.boolean()
    .describe(
      'Also publish a story derived from every piece (the same conversion as convert_content_format) on the ' +
      'rule accounts that support Stories (Instagram, Facebook, Snapchat), story_delay_minutes after the piece. ' +
      'Adds 4 credits per run.',
    ),
  story_delay_minutes: z.number().int().min(0).max(STORY_DELAY_MAX_MINUTES)
    .describe(`Minutes between the piece and its derived story. Default ${STORY_DELAY_DEFAULT_MINUTES} (2 hours).`),
};

const createSchema = z.object({
  ...autopilotRuleFields,
  frequency: autopilotRuleFields.frequency.default('weekly'),
  time_of_day: autopilotRuleFields.time_of_day.default('09:00'),
  timezone: autopilotRuleFields.timezone.default('UTC'),
  ai_model: autopilotRuleFields.ai_model.default('claude'),
  topic_hints: autopilotRuleFields.topic_hints.default([]),
  format: autopilotRuleFields.format.optional(),
  weekly_formats: autopilotRuleFields.weekly_formats.optional(),
  also_story: autopilotRuleFields.also_story.default(false),
  story_delay_minutes: autopilotRuleFields.story_delay_minutes.default(STORY_DELAY_DEFAULT_MINUTES),
}).strict();

const patchSchema = z.object({
  ...Object.fromEntries(Object.entries(autopilotRuleFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof autopilotRuleFields]: z.ZodOptional<(typeof autopilotRuleFields)[K]>
  },
  status: z.enum(['active', 'paused']).optional(),
}).strict();

const RULE_KEYS = [
  'name', 'channel', 'social_account_ids', 'frequency', 'day_of_week', 'time_of_day', 'timezone',
  'ai_model', 'tone', 'topic_hints', 'format', 'weekly_formats', 'also_story', 'story_delay_minutes',
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

function invalid(ctx: ServiceContext, es: string, en: string, field?: string): ServiceError {
  const message = msg(ctx.language, es, en);
  return new ServiceError('invalid_input', 422, message, field
    ? { error: message, issues: { formErrors: [], fieldErrors: { [field]: [message] } } }
    : undefined);
}

function dbError(message: string, ctx: ServiceContext | null, error: { message: string }, extra?: Record<string, unknown>): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx?.auth, extra });
  return new ServiceError('unavailable', 500, message).markReported();
}

function notFound(ctx: ServiceContext): ServiceError {
  return new ServiceError('not_found', 404, msg(ctx.language, 'Regla no encontrada', 'Rule not found'));
}

/** Las cuentas tienen que ser de la marca de la regla (y de la org). Devuelve sus redes. */
async function assertAccountsInBrand(ctx: ServiceContext, db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const { data, error } = await db
    .from('kefy_social_accounts')
    .select('id, platform')
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
  return (data as Array<{ platform: string }>).map((a) => a.platform);
}

/** {} o sin días → null; se quitan las claves vacías. */
function normalizeWeekly(weekly: WeeklyFormats | null | undefined): WeeklyFormats | null | undefined {
  if (weekly === undefined || weekly === null) return weekly;
  const out: WeeklyFormats = {};
  for (const [day, value] of Object.entries(weekly)) if (value) out[day as keyof WeeklyFormats] = value;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Lo que tiene que cumplir la configuración ya completa (alta, o regla +
 * cambios): la mezcla semanal solo en reglas diarias y con algún día que
 * publique, y si algo sale como story, alguna cuenta con Stories.
 */
function assertRuleConfig(
  ctx: ServiceContext,
  cfg: {
    frequency: Frequency; format: AutopilotFormat | null; weekly_formats: WeeklyFormats | null; also_story: boolean;
  },
  platforms: string[] | null,
): void {
  if (cfg.weekly_formats) {
    if (cfg.frequency !== 'daily') {
      throw invalid(ctx,
        'La mezcla semanal (weekly_formats) es solo para reglas diarias: pon frequency "daily".',
        'The weekly mix (weekly_formats) is only for daily rules: set frequency to "daily".', 'weekly_formats');
    }
    const skipped = Object.values(cfg.weekly_formats).filter((v) => v === WEEKDAY_SKIP).length;
    if (skipped === 7) {
      throw invalid(ctx, 'La mezcla semanal no publica ningún día.', 'The weekly mix skips every day.', 'weekly_formats');
    }
  }
  if (platforms && usesStory(cfg) && !platforms.some((p) => STORY_PLATFORMS.includes(p))) {
    throw invalid(ctx,
      'Las historias solo se publican en Instagram, Facebook o Snapchat, y la regla no tiene ninguna de esas cuentas.',
      'Stories are only published to Instagram, Facebook or Snapchat, and the rule has none of those accounts.',
      cfg.also_story ? 'also_story' : 'format');
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export type AutopilotRuleListItem = AutopilotRuleRow & { last_run: AutopilotLastRun | null; cost: RuleCost };

const LAST_RUN_COLUMNS =
  'id, status, ran_at, format, content_item_id, scheduled_post_ids, error_message, credits_estimated, ' +
  'video_status, video_attempts, story_status, story_error';

/**
 * Reglas de la marca del contexto, las más nuevas primero, con su última
 * ejecución (incluido el estado del video de un reel) y lo que cuestan.
 */
export async function listAutopilotRules(ctx: ServiceContext): Promise<AutopilotRuleListItem[]> {
  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .order('created_at', { ascending: false });
  if (error) throw dbError('Failed to fetch rules', ctx, error);
  const rules = ((data ?? []) as AutopilotRuleRow[]).map(withDefaults);
  if (rules.length === 0) return [];

  const { data: accountRows } = await db
    .from('kefy_social_accounts')
    .select('id, platform, status')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId);
  const accounts = (accountRows ?? []) as Array<{ id: string; platform: string; status: string }>;

  return Promise.all(rules.map(async (rule) => {
    const { data: runs } = await db
      .from('kefy_autopilot_runs')
      .select(LAST_RUN_COLUMNS)
      .eq('rule_id', rule.id)
      .order('ran_at', { ascending: false })
      .limit(1);
    const last = ((runs ?? []) as unknown as AutopilotLastRun[])[0] ?? null;
    const platforms = accounts
      .filter((a) => a.status === 'active' && rule.social_account_ids.includes(a.id))
      .map((a) => a.platform);
    return {
      ...rule,
      last_run: last ? { ...last, video_attempts: last.video_attempts ?? 0, scheduled_post_ids: last.scheduled_post_ids ?? [] } : null,
      cost: autopilotRuleCost(rule, platforms),
    };
  }));
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
    .select(`*, kefy_autopilot_runs ( ${LAST_RUN_COLUMNS} )`)
    .eq('id', ruleId)
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') q = q.eq('brand_id', ctx.brandId);
  const { data, error } = await q
    .order('ran_at', { referencedTable: 'kefy_autopilot_runs', ascending: false })
    .limit(10, { referencedTable: 'kefy_autopilot_runs' })
    .maybeSingle();
  if (error) throw dbError('Failed to fetch rule', ctx, error);
  if (!data) throw notFound(ctx);
  return withDefaults(data as AutopilotRuleRow & { kefy_autopilot_runs?: unknown[] });
}

export async function createAutopilotRule(ctx: ServiceContext, input: unknown): Promise<AutopilotRuleRow> {
  const parsed = parse(ctx, createSchema, input);
  const db = createSupabaseServer();
  const platforms = await assertAccountsInBrand(ctx, db, parsed.social_account_ids);

  const config = {
    frequency: parsed.frequency,
    format: parsed.format ?? null,
    weekly_formats: normalizeWeekly(parsed.weekly_formats) ?? null,
    also_story: parsed.also_story,
  };
  assertRuleConfig(ctx, config, platforms);

  const dayOfWeek = parsed.day_of_week ?? null;
  const nextRunAt = nextRunForRule({
    ...config, day_of_week: dayOfWeek, time_of_day: parsed.time_of_day, timezone: parsed.timezone,
  });

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
      format: config.format,
      weekly_formats: config.weekly_formats,
      also_story: config.also_story,
      story_delay_minutes: parsed.story_delay_minutes,
      status: 'active',
      next_run_at: nextRunAt.toISOString(),
    })
    .select()
    .single();
  if (error || !data) throw dbError('Failed to create rule', ctx, error ?? { message: 'no row' });
  return withDefaults(data as AutopilotRuleRow);
}

export async function updateAutopilotRule(
  ctx: ServiceContext,
  ruleId: string,
  input: unknown,
): Promise<AutopilotRuleRow> {
  const parsed = parse(ctx, patchSchema, input);
  const existing = await getAutopilotRule(ctx, ruleId);
  const db = createSupabaseServer();
  const weekly = normalizeWeekly(parsed.weekly_formats);

  // Las cuentas se validan contra la marca de la regla, no la del contexto.
  const ruleCtx = { ...ctx, brandId: existing.brand_id ?? ctx.brandId };
  const accountIds = parsed.social_account_ids ?? existing.social_account_ids;
  const configTouched = parsed.social_account_ids !== undefined || parsed.format !== undefined
    || parsed.weekly_formats !== undefined || parsed.also_story !== undefined || parsed.frequency !== undefined;
  const merged = {
    frequency: parsed.frequency ?? existing.frequency,
    format: parsed.format !== undefined ? parsed.format : existing.format,
    weekly_formats: weekly !== undefined ? weekly : existing.weekly_formats,
    also_story: parsed.also_story ?? existing.also_story,
  };
  if (configTouched) {
    const platforms = parsed.social_account_ids
      ? await assertAccountsInBrand(ruleCtx, db, accountIds)
      : await accountPlatforms(db, existing.org_id, existing.brand_id, accountIds);
    assertRuleConfig(ctx, merged, platforms);
  }

  const patch: Record<string, unknown> = {};
  for (const key of [
    'name', 'channel', 'social_account_ids', 'ai_model', 'tone', 'topic_hints', 'format', 'also_story',
    'story_delay_minutes', 'status',
  ] as const) {
    if (parsed[key] !== undefined) patch[key] = parsed[key];
  }
  if (weekly !== undefined) patch.weekly_formats = weekly;
  // Quien pausa o reanuda a mano manda: la pausa deja de ser «por créditos»
  // (el cron no la reanuda sola) y al reanudar se olvida el motivo.
  if (parsed.status !== undefined) Object.assign(patch, { paused_reason: null, paused_at: parsed.status === 'paused' ? new Date().toISOString() : null });

  const scheduleChanged =
    parsed.frequency !== undefined || parsed.day_of_week !== undefined ||
    parsed.time_of_day !== undefined || parsed.timezone !== undefined || weekly !== undefined;
  // Reanudar una regla pausada también recalcula: su next_run_at quedó en el pasado.
  const resumed = parsed.status === 'active' && existing.status === 'paused';

  if (scheduleChanged || resumed) {
    const frequency = merged.frequency;
    const dayOfWeek = parsed.day_of_week !== undefined ? parsed.day_of_week : existing.day_of_week;
    const timeOfDay = parsed.time_of_day ?? existing.time_of_day;
    const timezone = parsed.timezone ?? existing.timezone;
    Object.assign(patch, {
      frequency,
      day_of_week: dayOfWeek ?? null,
      time_of_day: timeOfDay,
      timezone,
      next_run_at: nextRunForRule({
        ...merged, day_of_week: dayOfWeek ?? null, time_of_day: timeOfDay, timezone,
      }).toISOString(),
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
  return withDefaults(data as AutopilotRuleRow);
}

async function accountPlatforms(db: Db, orgId: string, brandId: string | null, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  let q = db.from('kefy_social_accounts').select('platform').in('id', ids).eq('org_id', orgId);
  if (brandId) q = q.eq('brand_id', brandId);
  const { data } = await q;
  return ((data ?? []) as Array<{ platform: string }>).map((a) => a.platform);
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
// UI y el asistente:
//
//   post     → generateTextPost + generateImageForItem   (create_post)
//   carousel → generateCarousel, una imagen por slide     (create_carousel)
//   story    → generateStory, imagen vertical             (create_story)
//   reel     → generateReel + produceVideo                (create_reel + produce_video)
//
// Una story solo se publica en las cuentas con Stories (Instagram, Facebook,
// Snapchat): en las demás Zernio la publicaría como un post normal.
//
// Un reel tarda minutos en producirse: la ejecución deja la pieza esperando
// (`metadata.autopilot_publish`) y el cron la publica cuando el video está
// listo (publishReadyAutopilotReels). Si la producción falla, se reintenta una
// vez; si vuelve a fallar, la ejecución queda fallida y se avisa por correo.
//
// La story derivada (`also_story`) se genera cuando la pieza se publica o
// programa: con la conversión de formato (generateRendition, la de
// convert_content_format) y programada `story_delay_minutes` después del hueco
// de la pieza. Si falla, la pieza sigue publicada y el fallo queda en la
// ejecución (story_status 'failed').

/** Más cerca que esto del hueco, se publica ya en vez de programar. */
const MIN_SCHEDULE_LEAD_MS = 60 * 1000;
/** Un reel que no terminó de producirse en este tiempo no se publica. */
const REEL_WAIT_TIMEOUT_MS = 6 * 60 * 60 * 1000;
/** Producciones de un reel: la primera y un reintento. */
export const MAX_VIDEO_ATTEMPTS = 2;
/** El cron no empieza otra regla pasado esto: generar media tarda (maxDuration 300 s). */
const CRON_RUN_BUDGET_MS = 200 * 1000;
const MAX_PENDING_REELS_PER_RUN = 10;

type AccountRow = { id: string; zernio_account_id: string | null; platform: string };

const isStoryAccount = (a: { platform: string }) => STORY_PLATFORMS.includes(a.platform);

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

/** Lo que puede costar la regla: por formato, por ejecución y al mes. */
export async function autopilotRuleCostFor(rule: AutopilotRuleRow): Promise<RuleCost> {
  const r = withDefaults(rule);
  const platforms = (await activeAccounts(createSupabaseServer(), r)).map((a) => a.platform);
  return autopilotRuleCost(r, platforms);
}

/**
 * Costo de una configuración que todavía no está guardada (la tarjeta de
 * confirmación de save_autopilot_rule): la regla actual con los cambios.
 */
export async function previewAutopilotRuleCost(
  ctx: ServiceContext,
  config: Omit<RuleCostInput, 'timezone'> & { social_account_ids: string[]; timezone?: string },
): Promise<RuleCost> {
  const platforms = await accountPlatforms(createSupabaseServer(), ctx.auth.orgId, ctx.brandId || null, config.social_account_ids);
  return autopilotRuleCost({ ...config, timezone: config.timezone ?? 'UTC' }, platforms);
}

/**
 * Lo más caro que puede costar una ejecución de la regla (formato de cada día,
 * peor tema y story derivada). Es lo que la tarjeta de confirmación del chat
 * anuncia.
 */
export async function estimateAutopilotRuleCredits(rule: AutopilotRuleRow): Promise<number> {
  return (await autopilotRuleCostFor(rule)).per_run_max;
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
  const nextRun = nextRunForRule(rule, now, { afterRun: true });
  let q = db
    .from('kefy_autopilot_rules')
    .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
    .eq('id', rule.id);
  q = rule.next_run_at ? q.eq('next_run_at', rule.next_run_at) : q.is('next_run_at', null);
  const { data } = await q.select('id');
  return (data ?? []).length > 0;
}

/** Primer instante del mes de créditos siguiente (lib/usage: mes calendario en UTC). */
export function nextCreditPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function currentCreditPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Sin créditos en el cron: la regla se pausa (en vez de fallar en cada hueco)
 * y se avisa a quien la creó. La reanuda resumeCreditPausedRules al empezar
 * el mes siguiente, o una persona antes.
 */
async function pauseForCredits(db: Db, rule: AutopilotRuleRow, language: 'es' | 'en', reason: string, now: Date): Promise<boolean> {
  const { data } = await db
    .from('kefy_autopilot_rules')
    .update({ status: 'paused', paused_reason: 'credits_exhausted', paused_at: now.toISOString() })
    .eq('id', rule.id)
    .eq('status', 'active')
    .select('id');
  if (!(data ?? []).length) return false;
  await sendAutopilotAlert({
    kind: 'paused_credits', orgId: rule.org_id, ruleId: rule.id, ruleName: rule.name, userId: rule.created_by,
    language, detail: reason, resumesAt: nextCreditPeriodStart(now),
  });
  return true;
}

/**
 * Sin cuentas activas en el cron: se pausa y avisa en vez de fallar en cada
 * hueco. Se reanuda al reconectar la cuenta (restoreAccountToRules) o a mano.
 */
async function pauseForNoAccounts(db: Db, rule: AutopilotRuleRow, language: 'es' | 'en', reason: string, now: Date): Promise<boolean> {
  const { data } = await db
    .from('kefy_autopilot_rules')
    .update({ status: 'paused', paused_reason: 'no_accounts', paused_at: now.toISOString() })
    .eq('id', rule.id)
    .eq('status', 'active')
    .select('id');
  if (!(data ?? []).length) return false;
  await sendAutopilotAlert({
    kind: 'paused_no_accounts', orgId: rule.org_id, ruleId: rule.id, ruleName: rule.name, userId: rule.created_by,
    language, detail: reason,
  });
  return true;
}

/**
 * Reglas pausadas por créditos en un mes anterior: el saldo ya se renovó, así
 * que vuelven a estar activas con su calendario. Lo llama el cron.
 */
export async function resumeCreditPausedRules(now: Date = new Date()): Promise<string[]> {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_autopilot_rules')
    .select('*')
    .eq('status', 'paused')
    .eq('paused_reason', 'credits_exhausted')
    .lt('paused_at', currentCreditPeriodStart(now).toISOString())
    .limit(100);
  const resumed: string[] = [];
  for (const raw of (data ?? []) as AutopilotRuleRow[]) {
    const rule = withDefaults(raw);
    const { data: done } = await db
      .from('kefy_autopilot_rules')
      .update({
        status: 'active', paused_reason: null, paused_at: null,
        next_run_at: nextRunForRule(rule, now).toISOString(),
      })
      .eq('id', rule.id)
      .eq('status', 'paused')
      .eq('paused_reason', 'credits_exhausted')
      .select('id');
    if ((done ?? []).length) resumed.push(rule.id);
  }
  return resumed;
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
): Promise<{ ids: string[]; scheduled: boolean }> {
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
  return { ids: ok.map((r) => r.scheduled_post_id).filter((id): id is string => !!id), scheduled };
}

/** Genera la pieza con su media. Devuelve el id; un reel queda produciéndose. */
async function produceItem(
  ctx: ServiceContext,
  rule: AutopilotRuleRow,
  pickTopic: string,
  format: AutopilotFormat,
  sizes: { slideCount?: number; sceneCount?: number },
): Promise<string> {
  const topic = rule.tone ? `${pickTopic}\n(${msg(ctx.language, 'Tono', 'Tone')}: ${rule.tone})` : pickTopic;
  const channel = rule.channel;

  if (format === 'post') {
    const { itemId, result } = await generateTextPost(ctx, {
      topic, channel, model: rule.ai_model === 'gpt' ? 'gpt' : 'claude',
    });
    if (!itemId) throw new Error('Failed to save content item');
    try {
      // El mismo prompt que usa la UI para la imagen de un post: su texto.
      await generateImageForItem(ctx, { itemId, prompt: result.body.slice(0, 400) || pickTopic });
    } catch (err) {
      throw withItem(err, itemId);
    }
    return itemId;
  }

  if (format === 'carousel') {
    const out = await generateCarousel(ctx, { topic, channel, slideCount: sizes.slideCount });
    if (!out.itemId) throw new Error('Failed to save carousel');
    // Slides sin imagen se publicarían como texto sobre un fondo: no.
    if (out.slides.some((s) => !s.image_url)) {
      throw withItem(new Error(msg(ctx.language,
        'El carrusel quedó con slides sin imagen; queda como borrador.',
        'Some carousel slides have no image; it stays as a draft.')), out.itemId);
    }
    return out.itemId;
  }

  if (format === 'story') {
    const out = await generateStory(ctx, { topic, channel });
    if (!out.itemId) throw new Error('Failed to save story');
    // Una story sin imagen no se puede publicar (las Stories no muestran texto).
    if (!out.image_url) {
      const message = msg(ctx.language,
        'La historia quedó sin imagen; queda como borrador.', 'The story has no image; it stays as a draft.');
      throw withItem(out.imageError === 'credits_exhausted'
        ? new ServiceError('credits_exhausted', 429, message, { error: message, creditsExhausted: true })
        : new Error(message), out.itemId);
    }
    return out.itemId;
  }

  const out = await generateReel(ctx, { topic, channel, scene_count: sizes.sceneCount });
  const itemId = out.variants[0]!.itemId;
  try {
    await produceVideo(ctx, { itemId });
  } catch (err) {
    throw withItem(err, itemId);
  }
  return itemId;
}

/**
 * Relee la pieza y falla si no tiene la media de su formato (imagen del post o
 * de la story, imagen de cada slide). No confía en lo que devolvió el
 * generador: la imagen puede generarse y no quedar enlazada al contenido.
 */
async function assertItemMedia(db: Db, ctx: ServiceContext, itemId: string, format: AutopilotFormat): Promise<void> {
  const { data } = await db.from('kefy_content_items').select('image_url, slides').eq('id', itemId).maybeSingle();
  const missing = missingAutopilotMedia(format, data as AutopilotMediaRow | null);
  if (!missing) return;
  const err = new Error(msg(ctx.language,
    'La pieza quedó sin imagen; no se publica texto solo y queda como borrador.',
    'The piece has no image; text alone is never published, it stays as a draft.'));
  reportError(err, { route: ROUTE, service: 'autopilot', auth: ctx.auth, extra: { itemId, format, missing } });
  throw withItem(new ServiceError('provider_error', 502, err.message).markReported(), itemId);
}

/** Un fallo que deja una pieza a medias: se anota en la ejecución para encontrarla. */
function withItem(err: unknown, itemId: string): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  (e as Error & { itemId?: string }).itemId = itemId;
  return e;
}

const isCreditsError = (err: unknown) => err instanceof ServiceError && err.code === 'credits_exhausted';

export interface DerivedStoryResult {
  status: 'scheduled' | 'published' | 'failed' | 'skipped';
  scheduled_at?: string;
  scheduled_post_ids?: string[];
  error?: string;
}

/**
 * La story derivada de una pieza ya publicada o programada: la conversión de
 * formato (convert_content_format) y su publicación en las cuentas con Stories,
 * `story_delay_minutes` después del hueco de la pieza. Nunca lanza: si falla,
 * la pieza sigue en pie y el fallo queda en la ejecución.
 */
async function scheduleDerivedStory(
  db: Db,
  ctx: ServiceContext,
  rule: AutopilotRuleRow,
  args: { runId: string | null; itemId: string; mainAt: string | null; accounts: AccountRow[]; now: Date; cron: boolean },
): Promise<DerivedStoryResult> {
  const record = async (patch: Record<string, unknown>) => {
    if (args.runId) await db.from('kefy_autopilot_runs').update(patch).eq('id', args.runId);
  };
  const targets = args.accounts.filter(isStoryAccount);
  if (targets.length === 0) {
    const error = msg(ctx.language,
      'Ninguna cuenta de la regla tiene historias (Instagram, Facebook o Snapchat).',
      'None of the rule accounts supports stories (Instagram, Facebook or Snapchat).');
    await record({ story_status: 'skipped', story_error: error });
    return { status: 'skipped', error };
  }

  try {
    await generateRendition(ctx, { itemId: args.itemId, format: 'story' });
    const mainAt = args.mainAt && new Date(args.mainAt) > args.now ? new Date(args.mainAt) : args.now;
    const at = new Date(mainAt.getTime() + rule.story_delay_minutes * 60_000).toISOString();
    const { ids, scheduled } = await publishToAccounts(ctx, args.itemId, 'story', targets.map((a) => a.id), at);
    const status = scheduled ? 'scheduled' : 'published';
    await record({ story_status: status, story_scheduled_post_ids: ids, story_error: null });
    return { status, scheduled_at: at, scheduled_post_ids: ids };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Story failed';
    if (!(err instanceof ServiceError && (err.reported || err.status < 500))) {
      reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: rule.id, itemId: args.itemId, fase: 'story' } });
    }
    await record({ story_status: 'failed', story_error: error });
    if (args.cron && isCreditsError(err)) await pauseForCredits(db, rule, ctx.language, error, args.now);
    return { status: 'failed', error };
  }
}

export interface AutopilotRunResult {
  rule_id: string;
  rule_name: string;
  status: 'success' | 'failed';
  format?: AutopilotFormat;
  content_item_id?: string;
  scheduled_post_ids?: string[];
  /** Lo que se estimó antes de gastar (pieza + story derivada). */
  credits_estimated?: number;
  /** Reel: se publica cuando el video esté listo. */
  pending_video?: boolean;
  /** Reel: la producción falló y se lanzó otra. */
  video_retry?: boolean;
  /** Story derivada (also_story). */
  story?: DerivedStoryResult;
  /** La regla quedó pausada por falta de créditos. */
  paused?: boolean;
  error?: string;
}

export interface ExecuteOptions {
  /** Contexto de la persona que lo pidió. Sin él, es el cron. */
  ctx?: ServiceContext;
  /** Si no alcanzan los créditos o la suscripción, lanzar en vez de registrar el fallo. */
  throwIfBlocked?: boolean;
}

/**
 * Ejecuta una regla: genera la pieza en el formato que toca, en la marca de la
 * regla, la publica en sus cuentas activas para el hueco de la regla (un reel,
 * cuando su video esté listo), con su story derivada si se pidió, y adelanta
 * next_run_at. Registra la ejecución en kefy_autopilot_runs. Cobra por los
 * servicios, como la UI.
 */
export async function executeAutopilotRule(
  db: Db,
  rawRule: AutopilotRuleRow,
  now: Date = new Date(),
  opts: ExecuteOptions = {},
): Promise<AutopilotRunResult> {
  const rule = withDefaults(rawRule);
  const cron = !opts.ctx;
  const base = { rule_id: rule.id, rule_name: rule.name };
  const runRow = (row: Record<string, unknown>) => ({ rule_id: rule.id, org_id: rule.org_id, brand_id: rule.brand_id, ...row });
  const fail = async (
    message: string, extra: { itemId?: string; format?: AutopilotFormat; credits?: number } = {},
  ): Promise<AutopilotRunResult> => {
    await db.from('kefy_autopilot_runs').insert(runRow({
      content_item_id: extra.itemId ?? null, status: 'failed', error_message: message,
      format: extra.format ?? null, credits_estimated: extra.credits ?? null,
      ...(extra.format === 'reel' && extra.itemId ? { video_status: 'failed' } : {}),
    }));
    return { ...base, status: 'failed', format: extra.format, content_item_id: extra.itemId, credits_estimated: extra.credits, error: message };
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
  const slot = rule.next_run_at;
  const format = resolveRunFormat(rule, pick, accounts.map((a) => a.platform), slot ? new Date(slot) : now);
  // El tamaño de la etiqueta ([CARRUSEL 8 slides]) vale si el formato es el suyo.
  const sizes = pick.format === format ? { slideCount: pick.slideCount, sceneCount: pick.sceneCount } : {};
  const alsoStory = rule.also_story && format !== 'story';
  const credits = estimateRunCredits(format, { ...sizes, alsoStory });
  const targets = format === 'story' ? accounts.filter(isStoryAccount) : accounts;

  const blocked = accounts.length === 0
    ? new ServiceError('invalid_input', 422, msg(ctx.language,
      'La regla no tiene cuentas activas donde publicar.', 'The rule has no active accounts to post to.'))
    : targets.length === 0
      ? new ServiceError('invalid_input', 422, msg(ctx.language,
        'Hoy toca una historia y la regla no tiene cuentas con historias (Instagram, Facebook o Snapchat).',
        "Today's run is a story and the rule has no accounts with stories (Instagram, Facebook or Snapchat)."))
      : await preflight(ctx, credits);
  if (blocked && opts.throwIfBlocked) throw blocked;

  // Se reclama el hueco antes de gastar: si otra vuelta ya lo tomó, nada.
  if (!(await claimSlot(db, rule, now))) return { ...base, status: 'failed', error: 'Already running' };
  if (blocked) {
    const result = await fail(blocked.message, { format, credits });
    if (cron && blocked.code === 'credits_exhausted') result.paused = await pauseForCredits(db, rule, ctx.language, blocked.message, now);
    if (cron && accounts.length === 0) result.paused = await pauseForNoAccounts(db, rule, ctx.language, blocked.message, now);
    return result;
  }

  let itemId: string | undefined;
  try {
    itemId = await produceItem(ctx, rule, pick.topic, format, sizes);
    const autopilotMeta = { autopilot: true, rule_id: rule.id, model: rule.ai_model, autopilot_format: format };

    if (format === 'reel') {
      const { data: run } = await db.from('kefy_autopilot_runs').insert(runRow({
        content_item_id: itemId, scheduled_post_ids: [], status: 'success', format, credits_estimated: credits,
        video_status: 'producing', video_attempts: 1,
      })).select('id').single();
      await mergeItemMetadata(db, itemId, {
        ...autopilotMeta,
        autopilot_publish: {
          status: 'waiting',
          rule_id: rule.id,
          run_id: (run as { id?: string } | null)?.id ?? null,
          account_ids: targets.map((a) => a.id),
          scheduled_at: slot ?? now.toISOString(),
          requested_at: now.toISOString(),
          attempts: 1,
          also_story: alsoStory,
        },
      }, { status: 'approved' });
      return {
        ...base, status: 'success', format, content_item_id: itemId, scheduled_post_ids: [], pending_video: true,
        credits_estimated: credits,
      };
    }

    // Última barrera: la pieza guardada tiene que llevar su media. Un post de
    // puro texto no se publica nunca (queda como borrador y la ejecución falla).
    await assertItemMedia(db, ctx, itemId, format);

    await mergeItemMetadata(db, itemId, autopilotMeta, { status: 'approved', content_type: format });
    const { ids: scheduledPostIds } = await publishToAccounts(ctx, itemId, format, targets.map((a) => a.id), slot);

    const { data: run } = await db.from('kefy_autopilot_runs').insert(runRow({
      content_item_id: itemId, scheduled_post_ids: scheduledPostIds, status: 'success', format, credits_estimated: credits,
    })).select('id').single();
    const result: AutopilotRunResult = {
      ...base, status: 'success', format, content_item_id: itemId, scheduled_post_ids: scheduledPostIds,
      credits_estimated: credits,
    };
    if (alsoStory) {
      result.story = await scheduleDerivedStory(db, ctx, rule, {
        runId: (run as { id?: string } | null)?.id ?? null, itemId, mainAt: slot, accounts, now, cron,
      });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (!(err instanceof ServiceError && (err.reported || err.status < 500))) {
      reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: rule.id, orgId: rule.org_id, format } });
    }
    const result = await fail(message, { itemId: itemId ?? (err as { itemId?: string }).itemId, format, credits });
    if (cron && isCreditsError(err)) result.paused = await pauseForCredits(db, rule, ctx.language, message, now);
    return result;
  }
}

type PendingPublish = {
  status: 'waiting' | 'publishing' | 'done' | 'failed' | 'cancelled';
  rule_id: string;
  run_id: string | null;
  account_ids: string[];
  scheduled_at: string;
  requested_at: string;
  /** Producciones lanzadas (las piezas de antes no lo tienen: 1). */
  attempts?: number;
  also_story?: boolean;
  error?: string;
};

/**
 * Publica los reels del autopilot cuyo video ya está listo. Si la producción
 * falló, la relanza una vez; si vuelve a fallar (o lleva demasiado), cierra la
 * ejecución como fallida y avisa por correo. Lo llama el cron.
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
    const ruleRow = rule ? withDefaults(rule as AutopilotRuleRow) : null;
    const base = { rule_id: pending.rule_id, rule_name: ruleRow?.name ?? '', format: 'reel' as const, content_item_id: item.id };
    const attempts = pending.attempts ?? 1;

    const updateRun = async (patch: Record<string, unknown>) => {
      if (pending.run_id) await db.from('kefy_autopilot_runs').update(patch).eq('id', pending.run_id);
    };
    const close = async (status: PendingPublish['status'], patch: { error?: string; scheduled_post_ids?: string[] }) => {
      await mergeItemMetadata(db, item.id, { autopilot_publish: { ...pending, status, ...(patch.error ? { error: patch.error } : {}) } });
      await updateRun(patch.error
        ? { status: 'failed', error_message: patch.error, video_status: status === 'cancelled' ? 'cancelled' : 'failed' }
        : { scheduled_post_ids: patch.scheduled_post_ids ?? [], video_status: 'published' });
    };

    if (!ruleRow) {
      // La regla se borró mientras se producía: el video queda en la biblioteca.
      await close('cancelled', { error: 'Rule deleted' });
      continue;
    }

    let ctx: ServiceContext;
    try {
      ctx = await ruleContext(db, ruleRow);
    } catch (err) {
      reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: ruleRow.id, itemId: item.id } });
      await close('failed', { error: err instanceof Error ? err.message : 'Unknown error' });
      continue;
    }

    if (!ready) {
      // La producción falló (no es que siga en curso): se relanza una vez. Los
      // créditos del intento fallido ya se devolvieron (docs/video-pipeline.md).
      let retryError: string | null = null;
      if (!timedOut && attempts < MAX_VIDEO_ATTEMPTS) {
        try {
          await produceVideo(ctx, { itemId: item.id });
          await mergeItemMetadata(db, item.id, {
            autopilot_publish: { ...pending, status: 'waiting', attempts: attempts + 1, requested_at: now.toISOString() },
          });
          await updateRun({ video_status: 'producing', video_attempts: attempts + 1 });
          results.push({ ...base, status: 'success', pending_video: true, video_retry: true });
          continue;
        } catch (err) {
          retryError = err instanceof Error ? err.message : 'Retry failed';
          if (!(err instanceof ServiceError && (err.reported || err.status < 500))) {
            reportError(err, { route: ROUTE, service: 'autopilot', extra: { ruleId: ruleRow.id, itemId: item.id, fase: 'reintento' } });
          }
          if (isCreditsError(err)) await pauseForCredits(db, ruleRow, ctx.language, retryError, now);
        }
      }
      const error = timedOut
        ? msg(ctx.language, 'El video no terminó de producirse a tiempo.', 'The video did not finish in time.')
        : retryError ?? msg(ctx.language,
          `La producción del video falló (${attempts} ${attempts === 1 ? 'intento' : 'intentos'}).`,
          `The video production failed (${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}).`);
      await close('failed', { error });
      await sendAutopilotAlert({
        kind: 'video_failed', orgId: ruleRow.org_id, ruleId: ruleRow.id, ruleName: ruleRow.name,
        userId: ruleRow.created_by, language: ctx.language, detail: error,
      });
      results.push({ ...base, status: 'failed', error });
      continue;
    }

    try {
      const { ids } = await publishToAccounts(ctx, item.id, 'reel', pending.account_ids, pending.scheduled_at);
      await close('done', { scheduled_post_ids: ids });
      const result: AutopilotRunResult = { ...base, status: 'success', scheduled_post_ids: ids };
      if (pending.also_story) {
        result.story = await scheduleDerivedStory(db, ctx, ruleRow, {
          runId: pending.run_id, itemId: item.id, mainAt: pending.scheduled_at,
          accounts: await activeAccounts(db, ruleRow), now, cron: true,
        });
      }
      results.push(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Publish failed';
      reportError(err, { route: ROUTE, service: 'zernio', extra: { itemId: item.id, ruleId: pending.rule_id } });
      await close('failed', { error });
      await sendAutopilotAlert({
        kind: 'publish_failed', orgId: ruleRow.org_id, ruleId: ruleRow.id, ruleName: ruleRow.name,
        userId: ruleRow.created_by, language: ctx.language, detail: error,
      });
      results.push({ ...base, status: 'failed', error });
    }
  }
  return results;
}

export interface AutopilotRunSummary {
  executed: number;
  failed: number;
  results: AutopilotRunResult[];
  /** Cron: reglas pausadas por créditos que se reanudaron al renovarse el mes. */
  resumed?: string[];
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
 * Una persona que pide ejecutar ve el 429: la regla no se pausa.
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
 * Cron: reanuda las reglas pausadas por créditos de un mes anterior, publica
 * los reels que ya terminaron (o relanza los que fallaron) y ejecuta las
 * reglas activas vencidas de todas las orgs (o las `ruleIds` pedidas con el
 * secreto del cron). Cobra a cada org como la UI; sin saldo, la regla se pausa.
 */
export async function runScheduledAutopilot(
  ruleIds: string[] | null,
  now: Date = new Date(),
): Promise<AutopilotRunSummary> {
  const startedAt = Date.now();
  const resumed = await resumeCreditPausedRules(now);
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
  return { ...summarize(results), ...(resumed.length ? { resumed } : {}) };
}
