// ─── Autopilot: formatos, costo y calendario (puro) ──────────────────────────
//
// Lo comparten el servicio (lib/services/autopilot.ts), las herramientas del
// asistente y la página del autopilot: sin dependencias de servidor, para que
// la UI diga cuánto cuesta una regla antes de crearla.
//
// - Formato de cada ejecución: la mezcla semanal (`weekly_formats`) manda sobre
//   el formato de la regla (`format`), que manda sobre la etiqueta del tema
//   ([REEL 30s]…), que manda sobre la red (TikTok/YouTube → reel).
// - Costo: el de cada formato (docs/video-pipeline.md, «Costo») más la story
//   derivada (`also_story`), que es una conversión de formato.
// - Calendario: la hora es la local de la zona de la regla. Antes se calculaba
//   en la hora del servidor (UTC en Vercel), así que «09:00 America/Santiago»
//   salía a las 09:00 UTC y el día de la semana podía no ser el pedido.

import { OPERATION_CREDIT_COSTS as COST } from '@/lib/plans';

export const AUTOPILOT_FORMATS = ['post', 'carousel', 'story', 'reel'] as const;
export type AutopilotFormat = (typeof AUTOPILOT_FORMATS)[number];

/** Valor de la mezcla semanal que deja ese día sin publicación. */
export const WEEKDAY_SKIP = 'skip';
export type WeeklyFormatValue = AutopilotFormat | typeof WEEKDAY_SKIP;
export const WEEKLY_FORMAT_VALUES = [...AUTOPILOT_FORMATS, WEEKDAY_SKIP] as const;
/** Día de la semana (0 = domingo … 6 = sábado, como day_of_week) → formato. */
export type WeeklyFormats = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', WeeklyFormatValue>>;

export type AutopilotFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** Redes con superficie de Stories en Zernio (lib/zernio.ts STORY_CAPABLE_PLATFORMS; lo vigila un test). */
export const STORY_PLATFORMS: readonly string[] = ['instagram', 'facebook', 'snapchat'];
/** Redes donde un post sin video no tiene sentido: el formato por defecto es reel. */
const VIDEO_FIRST_PLATFORMS = new Set(['tiktok', 'youtube']);

export const DEFAULT_SLIDE_COUNT = 5;
export const DEFAULT_SCENE_COUNT = 5;

/** Story derivada: por defecto, 2 horas después del post. Como mucho, una semana. */
export const STORY_DELAY_DEFAULT_MINUTES = 120;
export const STORY_DELAY_MAX_MINUTES = 7 * 24 * 60;

/**
 * Créditos de la story derivada: es una conversión de formato a story (texto 1
 * + imagen 3, renditionCredits('story') en lib/services/renditions.ts).
 */
export const STORY_CONVERSION_CREDITS = COST.text + COST.image;

// ─── Costo ───────────────────────────────────────────────────────────────────

/**
 * Créditos que cuesta generar una pieza en ese formato. El reel es la
 * estimación del plan con animación `key` (hasta 3 planos animados) más el
 * guion; la story es la de create_story (texto + imagen vertical).
 */
export function estimateFormatCredits(
  format: AutopilotFormat,
  opts: { slideCount?: number; sceneCount?: number } = {},
): number {
  if (format === 'post' || format === 'story') return COST.text + COST.image;
  if (format === 'carousel') return COST.text + COST.image * (opts.slideCount ?? DEFAULT_SLIDE_COUNT);
  const scenes = opts.sceneCount ?? DEFAULT_SCENE_COUNT;
  return COST.text
    + scenes * (COST.image + COST.voice)
    + Math.min(3, scenes) * COST.animation
    + COST.video;
}

/** Una ejecución: la pieza más, si se pidió, su story derivada. */
export function estimateRunCredits(
  format: AutopilotFormat,
  opts: { slideCount?: number; sceneCount?: number; alsoStory?: boolean } = {},
): number {
  const derived = opts.alsoStory && format !== 'story' ? STORY_CONVERSION_CREDITS : 0;
  return estimateFormatCredits(format, opts) + derived;
}

export function defaultAutopilotFormat(platforms: string[]): AutopilotFormat {
  return platforms.length > 0 && platforms.every((p) => VIDEO_FIRST_PLATFORMS.has(p)) ? 'reel' : 'post';
}

// ─── Etiqueta del tema ───────────────────────────────────────────────────────

const FORMAT_TAG = /^\s*\[([^\]]*)\]\s*/;
/** Un plano de reel dura ~5 s: «[REEL 30s]» son 6 planos. */
const SECONDS_PER_SCENE = 5;
export const REEL_SCENES_MIN = 3;
export const REEL_SCENES_MAX = 8;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

export interface AutopilotTopic {
  /** null: el tema no lo dice; decide la regla o la red. */
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
      sceneCount: seconds ? clamp(seconds / SECONDS_PER_SCENE, REEL_SCENES_MIN, REEL_SCENES_MAX) : undefined,
    };
  }
  if (/\b(carrusel|carousel)\b/.test(tag)) {
    const slides = num(/(\d+)/);
    return { format: 'carousel', topic, slideCount: slides ? clamp(slides, 3, 10) : undefined };
  }
  if (/\b(story|stories|historias?)\b/.test(tag)) return { format: 'story', topic };
  if (/\b(post|imagen|image|foto|photo)\b/.test(tag)) return { format: 'post', topic };
  // Una etiqueta que no es de formato es parte del tema.
  return { format: null, topic: raw.trim() };
}

// ─── Formato de cada ejecución ───────────────────────────────────────────────

export interface RuleFormatConfig {
  format: AutopilotFormat | null;
  weekly_formats: WeeklyFormats | null;
  timezone: string;
}

/** Lo que dice la mezcla semanal para ese día (en la zona de la regla). */
export function weeklyFormatFor(rule: RuleFormatConfig, slot: Date): WeeklyFormatValue | null {
  if (!rule.weekly_formats) return null;
  const day = String(zonedParts(slot, rule.timezone).weekday) as keyof WeeklyFormats;
  return rule.weekly_formats[day] ?? null;
}

/**
 * Formato de la ejecución del hueco `slot`: mezcla semanal → formato de la
 * regla → etiqueta del tema → red.
 */
export function resolveRunFormat(
  rule: RuleFormatConfig,
  pick: AutopilotTopic,
  platforms: string[],
  slot: Date,
): AutopilotFormat {
  const weekly = weeklyFormatFor(rule, slot);
  if (weekly && weekly !== WEEKDAY_SKIP) return weekly;
  return rule.format ?? pick.format ?? defaultAutopilotFormat(platforms);
}

/** ¿Algún día de la semana sale como story (base o mezcla)? */
export function usesStory(rule: Pick<RuleFormatConfig, 'format' | 'weekly_formats'> & { also_story?: boolean }): boolean {
  return !!rule.also_story
    || rule.format === 'story'
    || Object.values(rule.weekly_formats ?? {}).includes('story');
}

// ─── Resumen de costo de una regla ───────────────────────────────────────────

export interface RuleCostInput extends RuleFormatConfig {
  frequency: AutopilotFrequency;
  also_story: boolean;
  topic_hints: string[];
  name: string;
}

export interface RuleCost {
  /** Lo menos y lo más que puede costar una ejecución. */
  per_run_min: number;
  per_run_max: number;
  /** Cada formato que puede salir, con su costo por ejecución (story derivada incluida). */
  by_format: Partial<Record<AutopilotFormat, number>>;
  /** Estimación de un mes de ejecuciones (≈ 30 días), con el peor tema en cada día. */
  per_month: number;
}

/** Ejecuciones de cada día de la semana en un mes de ~30 días. */
const RUNS_PER_WEEKDAY_PER_MONTH = 30 / 7;

/**
 * Costo de una regla. Sin formato fijo, cada ejecución elige un tema al azar y
 * el tema decide: se toma el peor caso entre los temas (lo que anuncia la
 * tarjeta de confirmación del chat).
 */
export function autopilotRuleCost(rule: RuleCostInput, platforms: string[]): RuleCost {
  const topics = (rule.topic_hints.length > 0 ? rule.topic_hints : [rule.name]).map(parseAutopilotTopic);
  const fallback = defaultAutopilotFormat(platforms);
  const runCost = (format: AutopilotFormat) => Math.max(...topics.map((t) => estimateRunCredits(format, {
    slideCount: t.format === format ? t.slideCount : undefined,
    sceneCount: t.format === format ? t.sceneCount : undefined,
    alsoStory: rule.also_story,
  })));

  // Formatos del día «base»: el de la regla, o los que digan los temas.
  const baseFormats: AutopilotFormat[] = rule.format
    ? [rule.format]
    : [...new Set(topics.map((t) => t.format ?? fallback))];
  const baseCost = Math.max(...baseFormats.map(runCost));
  const baseMin = Math.min(...baseFormats.map(runCost));

  const byFormat: Partial<Record<AutopilotFormat, number>> = {};
  for (const f of baseFormats) byFormat[f] = runCost(f);

  // Coste de cada día de la semana (null = no se publica).
  const dayCosts: Array<{ min: number; max: number } | null> = [];
  for (let d = 0; d < 7; d++) {
    const v = rule.weekly_formats?.[String(d) as keyof WeeklyFormats];
    if (v === WEEKDAY_SKIP) { dayCosts.push(null); continue; }
    if (v) {
      const c = runCost(v);
      byFormat[v] = c;
      dayCosts.push({ min: c, max: c });
      continue;
    }
    dayCosts.push({ min: baseMin, max: baseCost });
  }

  const active = dayCosts.filter((c): c is { min: number; max: number } => c !== null);
  const perRunMin = active.length ? Math.min(...active.map((c) => c.min)) : 0;
  const perRunMax = active.length ? Math.max(...active.map((c) => c.max)) : 0;

  let perMonth: number;
  if (rule.frequency === 'daily') {
    perMonth = active.reduce((sum, c) => sum + c.max * RUNS_PER_WEEKDAY_PER_MONTH, 0);
  } else {
    const runs = rule.frequency === 'weekly' ? 30 / 7 : rule.frequency === 'biweekly' ? 30 / 14 : 1;
    perMonth = perRunMax * runs;
  }

  return { per_run_min: perRunMin, per_run_max: perRunMax, by_format: byFormat, per_month: Math.round(perMonth) };
}

// ─── Calendario en la zona de la regla ───────────────────────────────────────

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
}

/** Fecha y hora de pared de `date` en la zona `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')), second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** El instante en que en `timeZone` son las hh:mm del día (y, m, d). */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ts = wall - offsetMs(wall, timeZone);
  // Segunda pasada: el desfase puede cambiar justo ahí (horario de verano).
  ts = wall - offsetMs(ts, timeZone);
  return new Date(ts);
}

/**
 * Próxima ejecución según el calendario, en la hora local de la zona.
 * `afterRun`: se calcula justo después de una ejecución (claimSlot); solo
 * cambia el quincenal, que salta una semana más.
 */
export function computeNextRun(
  frequency: AutopilotFrequency,
  dayOfWeek: number | null,
  timeOfDay: string, // "HH:MM"
  timezone: string,
  after: Date = new Date(),
  opts: { afterRun?: boolean } = {},
): Date {
  const [hh, mm] = timeOfDay.split(':').map(Number);
  const local = zonedParts(after, timezone);
  const dayAt = (offset: number) => new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
  const at = (offset: number) => {
    const d = dayAt(offset);
    return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hh, mm ?? 0, timezone);
  };

  if (frequency === 'monthly') {
    // El mismo día, el mes siguiente (o el último del mes si no existe).
    const target = new Date(Date.UTC(local.year, local.month, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(local.day, lastDay), hh, mm ?? 0, timezone);
  }

  if (frequency === 'daily') {
    for (let i = 0; i < 3; i++) {
      const c = at(i);
      if (c > after) return c;
    }
    return at(3);
  }

  const target = dayOfWeek ?? 1; // lunes por defecto
  for (let i = 0; i < 15; i++) {
    if (dayAt(i).getUTCDay() !== target) continue;
    const c = at(i);
    if (c <= after) continue;
    return frequency === 'biweekly' && opts.afterRun ? at(i + 7) : c;
  }
  return at(7);
}

/**
 * Como computeNextRun, pero se salta los días que la mezcla semanal deja sin
 * publicación (`skip`). Solo aplica a la frecuencia diaria.
 */
export function nextRunForRule(
  rule: RuleFormatConfig & { frequency: AutopilotFrequency; day_of_week: number | null; time_of_day: string },
  after: Date = new Date(),
  opts: { afterRun?: boolean } = {},
): Date {
  let next = computeNextRun(rule.frequency, rule.day_of_week, rule.time_of_day, rule.timezone, after, opts);
  if (rule.frequency !== 'daily' || !rule.weekly_formats) return next;
  for (let i = 0; i < 7 && weeklyFormatFor(rule, next) === WEEKDAY_SKIP; i++) {
    next = computeNextRun('daily', null, rule.time_of_day, rule.timezone, next);
  }
  return next;
}

// ─── Media antes de publicar ─────────────────────────────────────────────────

/** Lo que se lee del contenido justo antes de publicarlo. */
export interface AutopilotMediaRow {
  image_url: string | null;
  slides: unknown;
}

/**
 * ¿Le falta media a la pieza para publicarse en su formato? Se mira en la fila
 * guardada, no en lo que devolvió el generador: entre junio y septiembre de
 * 2026 el autopilot publicó posts de puro texto (sin imagen) y la imagen puede
 * generarse bien y aun así no quedar enlazada al contenido. Devuelve el motivo,
 * o null si está completa. Un reel se publica aparte, cuando su video está listo.
 */
export function missingAutopilotMedia(format: AutopilotFormat, row: AutopilotMediaRow | null): string | null {
  if (format === 'reel') return null;
  if (!row) return 'missing_item';
  if (format === 'carousel') {
    const slides = Array.isArray(row.slides) ? (row.slides as Array<{ image_url?: string | null }>) : [];
    if (slides.length === 0) return 'no_slides';
    return slides.every((s) => typeof s?.image_url === 'string' && s.image_url.trim() !== '') ? null : 'slide_without_image';
  }
  return typeof row.image_url === 'string' && row.image_url.trim() !== '' ? null : 'no_image';
}
