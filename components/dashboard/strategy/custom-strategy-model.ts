// ─── Estrategias propias: modelo del lado del cliente ───────────────────────
//
// Constantes y funciones puras que usan el panel y el editor de estrategias
// propias. Replican las reglas de lib/services/custom-strategy.ts (que carga
// Supabase y no se puede importar en el navegador); un test comprueba que no
// se desalineen.

import { ORGANIC_CHANNELS } from '@/lib/channels';
import type {
  CustomCalendarItem,
  CustomStrategy,
  CustomStrategyFormat,
  Strategy,
  StrategyTemplate,
} from '@/types/strategy';

export const CUSTOM_STRATEGY_LIMITS = { perOrg: 20, weeks: 12, posts: 60 } as const;

/** Máximo de caracteres por campo, igual que el esquema del servicio. */
export const CUSTOM_TEXT_LIMITS = {
  name: 120,
  description: 2000,
  kpi: 200,
  cta_mechanic: 1000,
  topic: 300,
  angle: 500,
  goal: 200,
} as const;

export const CUSTOM_FORMATS: readonly CustomStrategyFormat[] = ['post', 'carousel', 'reel', 'story'];

/** 'general' = la pieza sirve para cualquier red. */
export const CUSTOM_CHANNELS: readonly string[] = ['general', ...ORGANIC_CHANNELS.map((c) => c.value)];

// ─── Borrador del editor ─────────────────────────────────────────────────────

export interface CustomDraftRow {
  /** Clave estable para React; no se envía. */
  key: string;
  week: number;
  format: CustomStrategyFormat;
  channel: string;
  topic: string;
  angle: string;
  goal: string;
}

export interface CustomDraft {
  name: string;
  description: string;
  /** '' = sin objetivo. */
  objective_id: string;
  based_on_strategy_id: string | null;
  kpi_primary: string;
  kpi_secondary: string;
  cta_mechanic: string;
  calendar: CustomDraftRow[];
}

let rowSeq = 0;
export function newRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

export function emptyRow(week = 1): CustomDraftRow {
  return { key: newRowKey(), week, format: 'post', channel: 'general', topic: '', angle: '', goal: '' };
}

export function emptyDraft(): CustomDraft {
  return {
    name: '',
    description: '',
    objective_id: '',
    based_on_strategy_id: null,
    kpi_primary: '',
    kpi_secondary: '',
    cta_mechanic: '',
    calendar: [emptyRow(1)],
  };
}

const clip = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);

function clampWeek(week: number): number {
  if (!Number.isFinite(week)) return 1;
  return Math.min(CUSTOM_STRATEGY_LIMITS.weeks, Math.max(1, Math.round(week)));
}

/** Formato del catálogo (carrusel, reel, historia…) → formato de una estrategia propia. */
export function mapCatalogFormat(format: string | null | undefined): CustomStrategyFormat {
  const f = (format ?? '').trim().toLowerCase();
  if (f === 'carrusel' || f === 'carousel') return 'carousel';
  if (f === 'reel' || f === 'reels') return 'reel';
  if (f === 'story' || f === 'stories' || f === 'historia' || f === 'historias') return 'story';
  return 'post';
}

export function mapCatalogChannel(channel: string | null | undefined): string {
  const c = (channel ?? '').trim().toLowerCase();
  return CUSTOM_CHANNELS.includes(c) ? c : 'general';
}

/** Borrador a partir de una estrategia guardada (para editarla). */
export function draftFromCustom(s: CustomStrategy): CustomDraft {
  return {
    name: s.name,
    description: s.description ?? '',
    objective_id: s.objective_id ?? '',
    based_on_strategy_id: s.based_on_strategy_id,
    kpi_primary: s.kpi_primary ?? '',
    kpi_secondary: s.kpi_secondary ?? '',
    cta_mechanic: s.cta_mechanic ?? '',
    calendar: !s.calendar.length ? [emptyRow(1)] : s.calendar.map((item) => ({
      key: newRowKey(),
      week: clampWeek(item.week),
      format: CUSTOM_FORMATS.includes(item.format) ? item.format : 'post',
      channel: mapCatalogChannel(item.channel),
      topic: item.topic ?? '',
      angle: item.angle ?? '',
      goal: item.goal ?? '',
    })),
  };
}

/**
 * «Partir de la recomendada»: convierte una estrategia del catálogo y sus
 * plantillas en un borrador editable, con los textos en el idioma actual.
 */
export function draftFromCatalog(
  strategy: Strategy,
  templates: StrategyTemplate[],
  opts: { locale: 'es' | 'en'; objectiveId: string | null; suffix: string },
): CustomDraft {
  const en = opts.locale === 'en';
  const pick = (es?: string | null, enText?: string | null) => (en ? (enText || es) : (es || enText)) ?? '';

  const frameworkName = pick(strategy.framework_name_es, strategy.framework_name_en);
  const suffix = ` ${opts.suffix}`;
  const name = frameworkName.slice(0, CUSTOM_TEXT_LIMITS.name - suffix.length) + suffix;

  const calendar = [...templates]
    .sort((a, b) => a.week_num - b.week_num || a.post_num - b.post_num)
    .slice(0, CUSTOM_STRATEGY_LIMITS.posts)
    .map<CustomDraftRow>((tpl) => ({
      key: newRowKey(),
      week: clampWeek(tpl.week_num),
      format: mapCatalogFormat(tpl.format),
      channel: mapCatalogChannel(tpl.channel_hint),
      topic: clip(pick(tpl.topic_es, tpl.topic_en), CUSTOM_TEXT_LIMITS.topic),
      angle: clip(pick(tpl.copy_structure_es, tpl.copy_structure_en), CUSTOM_TEXT_LIMITS.angle),
      goal: clip(pick(tpl.goal_es, tpl.goal_en), CUSTOM_TEXT_LIMITS.goal),
    }));

  return {
    name: name.trim(),
    description: clip(pick(strategy.framework_desc_es, strategy.framework_desc_en), CUSTOM_TEXT_LIMITS.description),
    objective_id: opts.objectiveId ?? '',
    based_on_strategy_id: strategy.id,
    kpi_primary: clip(pick(strategy.kpi_primary_es, strategy.kpi_primary_en), CUSTOM_TEXT_LIMITS.kpi),
    kpi_secondary: clip(pick(strategy.kpi_secondary_es, strategy.kpi_secondary_en), CUSTOM_TEXT_LIMITS.kpi),
    cta_mechanic: clip(pick(strategy.cta_mechanic_es, strategy.cta_mechanic_en), CUSTOM_TEXT_LIMITS.cta_mechanic),
    calendar: calendar.length ? calendar : [emptyRow(1)],
  };
}

// ─── Validación y envío ──────────────────────────────────────────────────────

export type DraftError = 'nameRequired' | 'rowsRequired' | 'tooManyRows' | 'topicRequired';

export interface DraftValidation {
  errors: DraftError[];
  /** Claves de las filas sin tema. */
  rowsWithoutTopic: string[];
}

export function validateDraft(draft: CustomDraft): DraftValidation {
  const errors: DraftError[] = [];
  if (!draft.name.trim()) errors.push('nameRequired');
  if (draft.calendar.length === 0) errors.push('rowsRequired');
  if (draft.calendar.length > CUSTOM_STRATEGY_LIMITS.posts) errors.push('tooManyRows');
  const rowsWithoutTopic = draft.calendar.filter((r) => !r.topic.trim()).map((r) => r.key);
  if (rowsWithoutTopic.length) errors.push('topicRequired');
  return { errors, rowsWithoutTopic };
}

export interface CustomStrategyPayload {
  name: string;
  description: string | null;
  objective_id: string | null;
  based_on_strategy_id: string | null;
  kpi_primary: string | null;
  kpi_secondary: string | null;
  cta_mechanic: string | null;
  calendar: CustomCalendarItem[];
}

const orNull = (value: string, max: number) => clip(value, max) || null;

/** Cuerpo para POST / PATCH /api/strategies/custom. */
export function draftToPayload(draft: CustomDraft): CustomStrategyPayload {
  return {
    name: clip(draft.name, CUSTOM_TEXT_LIMITS.name),
    description: orNull(draft.description, CUSTOM_TEXT_LIMITS.description),
    objective_id: draft.objective_id || null,
    based_on_strategy_id: draft.based_on_strategy_id || null,
    kpi_primary: orNull(draft.kpi_primary, CUSTOM_TEXT_LIMITS.kpi),
    kpi_secondary: orNull(draft.kpi_secondary, CUSTOM_TEXT_LIMITS.kpi),
    cta_mechanic: orNull(draft.cta_mechanic, CUSTOM_TEXT_LIMITS.cta_mechanic),
    calendar: draft.calendar.map((r) => ({
      week: clampWeek(r.week),
      format: r.format,
      channel: r.channel,
      topic: clip(r.topic, CUSTOM_TEXT_LIMITS.topic),
      angle: orNull(r.angle, CUSTOM_TEXT_LIMITS.angle),
      goal: orNull(r.goal, CUSTOM_TEXT_LIMITS.goal),
    })),
  };
}

/** Semanas distintas y piezas de una estrategia, para las tarjetas. */
export function calendarStats(calendar: CustomCalendarItem[]): { weeks: number; pieces: number } {
  return { weeks: new Set(calendar.map((c) => c.week)).size, pieces: calendar.length };
}

/** Parámetros de /dashboard/content para generar una pieza del calendario. */
export function generateParams(item: Pick<CustomCalendarItem, 'channel' | 'format' | 'topic'>): URLSearchParams {
  return new URLSearchParams({
    channel: !item.channel || item.channel === 'general' ? 'instagram' : item.channel,
    topic: item.topic,
    type: CUSTOM_FORMATS.includes(item.format) ? item.format : 'post',
  });
}
