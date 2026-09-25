// ─── Servicio: estrategia de contenido ───────────────────────────────────────
//
// Lógica de /api/strategies, /api/strategies/recommend y /api/strategies/org,
// y los helpers de plantillas que usa /api/content/recommend. Lo comparten las
// rutas de la UI y las herramientas del asistente (get_strategy_catalog,
// preview_strategy, set_active_strategy, get_content_ideas).
//
// La estrategia es de la organización (kefy_org_strategies tiene una fila por
// org), no de la marca: cambiarla afecta a todas las marcas.
//
// La activa puede ser del catálogo (strategy_id) o propia de la org
// (custom_strategy_id, ver lib/services/custom-strategy.ts). Si hay una
// propia, manda ella.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import {
  createCustomStrategy, getCustomStrategy, loadCustomStrategyBundle, updateCustomStrategy,
  type CustomStrategy,
} from '@/lib/services/custom-strategy';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/strategy';

function dbError(message: string, ctx: ServiceContext | null, error: { message: string }): ServiceError {
  reportError(new Error(error.message), { route: ROUTE, service: 'supabase', auth: ctx?.auth });
  return new ServiceError('unavailable', 500, message);
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export interface StrategyObjectiveRow {
  id: string;
  slug: string;
  name_es: string | null;
  name_en: string | null;
  desc_es: string | null;
  desc_en: string | null;
  icon: string | null;
  sort_order: number | null;
}

export interface StrategyIndustryRow {
  id: string;
  slug: string;
  name_es: string | null;
  name_en: string | null;
  icon: string | null;
  desc_es: string | null;
  sort_order: number | null;
}

/** Objetivos e industrias que se combinan en una estrategia (ambos idiomas). */
export async function getStrategyCatalog(): Promise<{
  objectives: StrategyObjectiveRow[];
  industries: StrategyIndustryRow[];
}> {
  const supabase = createSupabaseServer();

  const [objectivesRes, industriesRes] = await Promise.all([
    supabase
      .from('kefy_content_objectives')
      .select('id, slug, name_es, name_en, desc_es, desc_en, icon, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('kefy_content_industries')
      .select('id, slug, name_es, name_en, icon, desc_es, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  if (objectivesRes.error) throw dbError('Failed to load objectives', null, objectivesRes.error);
  if (industriesRes.error) throw dbError('Failed to load industries', null, industriesRes.error);

  return {
    objectives: (objectivesRes.data ?? []) as StrategyObjectiveRow[],
    industries: (industriesRes.data ?? []) as StrategyIndustryRow[],
  };
}

// ─── Vista previa de una estrategia ──────────────────────────────────────────

const STRATEGY_PREVIEW_COLUMNS = `id, framework_slug, framework_name_es, framework_name_en,
       framework_desc_es, framework_desc_en,
       kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
       interaction_layers, cta_mechanic_es, cta_mechanic_en`;

const TEMPLATE_COLUMNS = `id, week_num, post_num, format, channel_hint,
       topic_es, copy_structure_es, goal_es,
       topic_en, copy_structure_en, goal_en, sort_order`;

export interface StrategyPreviewRow {
  id: string;
  framework_slug: string | null;
  framework_name_es: string | null;
  framework_name_en: string | null;
  framework_desc_es: string | null;
  framework_desc_en: string | null;
  kpi_primary_es: string | null;
  kpi_secondary_es: string | null;
  kpi_primary_en: string | null;
  kpi_secondary_en: string | null;
  interaction_layers: unknown;
  cta_mechanic_es: string | null;
  cta_mechanic_en: string | null;
  objective_id?: string;
}

export interface StrategyTemplate {
  id:                string;
  week_num:          number;
  post_num:          number;
  format:            string | null;
  channel_hint:      string | null;
  topic_es:          string | null;
  topic_en:          string | null;
  goal_es:           string | null;
  goal_en:           string | null;
  sort_order:        number | null;
  copy_structure_es: string | null;
  copy_structure_en: string | null;
}

export interface StrategyPreview {
  strategy: StrategyPreviewRow | null;
  templates: StrategyTemplate[];
  is_fallback?: true;
  fallback_objective?: { name_es: string; name_en: string };
}

/**
 * Estrategia para un par objetivo × industria, con sus plantillas semanales.
 * Si no hay coincidencia exacta, cae a cualquier estrategia de la industria
 * (`is_fallback`) e informa el objetivo al que pertenece realmente.
 */
export async function previewStrategy(objectiveId: string, industryId: string): Promise<StrategyPreview> {
  const supabase = createSupabaseServer();

  const { data: strategy, error: stratError } = await supabase
    .from('kefy_content_strategies')
    .select(STRATEGY_PREVIEW_COLUMNS)
    .eq('objective_id', objectiveId)
    .eq('industry_id', industryId)
    .single();

  if (stratError || !strategy) {
    // Sin coincidencia exacta: cualquier estrategia de esta industria.
    const { data: fallbackStrat } = await supabase
      .from('kefy_content_strategies')
      .select(`${STRATEGY_PREVIEW_COLUMNS}, objective_id`)
      .eq('industry_id', industryId)
      .limit(1)
      .single();

    if (!fallbackStrat) return { strategy: null, templates: [] };

    const [{ data: fallbackObj }, { data: fallbackTpls }] = await Promise.all([
      supabase
        .from('kefy_content_objectives')
        .select('name_es, name_en')
        .eq('id', fallbackStrat.objective_id)
        .single(),
      supabase
        .from('kefy_strategy_templates')
        .select(TEMPLATE_COLUMNS)
        .eq('strategy_id', fallbackStrat.id)
        .order('week_num', { ascending: true })
        .order('sort_order', { ascending: true }),
    ]);

    return {
      strategy: fallbackStrat as StrategyPreviewRow,
      templates: (fallbackTpls ?? []) as StrategyTemplate[],
      is_fallback: true,
      fallback_objective: {
        name_es: fallbackObj?.name_es ?? '',
        name_en: fallbackObj?.name_en ?? '',
      },
    };
  }

  const { data: templates, error: tplError } = await supabase
    .from('kefy_strategy_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('strategy_id', strategy.id)
    .order('week_num', { ascending: true })
    .order('sort_order', { ascending: true });

  if (tplError) throw dbError('Failed to load templates', null, tplError);

  return { strategy: strategy as StrategyPreviewRow, templates: (templates ?? []) as StrategyTemplate[] };
}

// ─── Selección de la organización ────────────────────────────────────────────

export interface OrgStrategySelection {
  id: string;
  org_id: string;
  objective_id: string | null;
  industry_id: string | null;
  strategy_id: string | null;
  custom_strategy_id: string | null;
  custom_notes: string | null;
  updated_at: string;
}

export interface StrategyNames {
  objective: string | null;
  industry: string | null;
  /** Nombre del framework del catálogo, o de la estrategia propia si es la activa. */
  framework: string | null;
  /** true si la activa es una estrategia propia de la org. */
  custom: boolean;
}

const SELECTION_COLUMNS = 'id, org_id, objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes, updated_at';

/**
 * Nombres legibles (en el idioma pedido) de un objetivo, industria y estrategia.
 * La estrategia propia solo se busca dentro de `orgId`.
 */
export async function strategyNames(
  lang: 'es' | 'en',
  ids: {
    objective_id?: string | null;
    industry_id?: string | null;
    strategy_id?: string | null;
    custom_strategy_id?: string | null;
  },
  orgId?: string,
): Promise<StrategyNames> {
  const db = createSupabaseServer();
  const none = Promise.resolve({ data: null });

  const [{ data: objective }, { data: industry }, { data: strategy }, { data: custom }] = await Promise.all([
    ids.objective_id
      ? db.from('kefy_content_objectives').select('name_es, name_en').eq('id', ids.objective_id).maybeSingle()
      : none,
    ids.industry_id
      ? db.from('kefy_content_industries').select('name_es, name_en').eq('id', ids.industry_id).maybeSingle()
      : none,
    ids.strategy_id
      ? db.from('kefy_content_strategies').select('framework_name_es, framework_name_en').eq('id', ids.strategy_id).maybeSingle()
      : none,
    ids.custom_strategy_id && orgId
      ? db.from('kefy_custom_strategies').select('name').eq('id', ids.custom_strategy_id).eq('org_id', orgId).maybeSingle()
      : none,
  ]);

  const o = objective as { name_es: string | null; name_en: string | null } | null;
  const i = industry as { name_es: string | null; name_en: string | null } | null;
  const s = strategy as { framework_name_es: string | null; framework_name_en: string | null } | null;
  const c = custom as { name: string } | null;

  return {
    objective: (lang === 'en' ? o?.name_en : o?.name_es) ?? null,
    industry: (lang === 'en' ? i?.name_en : i?.name_es) ?? null,
    framework: c?.name ?? (lang === 'en' ? s?.framework_name_en : s?.framework_name_es) ?? null,
    custom: !!c,
  };
}

/**
 * Selección de estrategia de la organización. Con `withNames` (por defecto)
 * añade los nombres del objetivo, la industria y el framework; la ruta GET no
 * los necesita.
 */
export async function getOrgStrategy(
  ctx: ServiceContext,
  opts: { withNames?: boolean } = {},
): Promise<{ selection: OrgStrategySelection | null; names: StrategyNames | null }> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('kefy_org_strategies')
    .select(SELECTION_COLUMNS)
    .eq('org_id', ctx.auth.orgId)
    .single();

  // PGRST116 = "no rows found": lo normal en una organización nueva.
  if (error && error.code !== 'PGRST116') {
    throw dbError('Failed to load strategy selection', ctx, error);
  }

  const selection = (data as OrgStrategySelection | null) ?? null;
  if (!selection || opts.withNames === false) return { selection, names: null };

  return { selection, names: await strategyNames(ctx.language, selection, ctx.auth.orgId) };
}

export interface OrgStrategyPatch {
  objective_id?: string | null;
  industry_id?: string | null;
  strategy_id?: string | null;
  /** Estrategia propia de la org. `null` vuelve a la del catálogo. */
  custom_strategy_id?: string | null;
  custom_notes?: string | null;
}

/**
 * Comprueba que `strategyId` corresponde al par objetivo × industria. También
 * se acepta la estrategia de respaldo que previewStrategy ofrece cuando el par
 * no tiene una propia: es la que la UI guarda en ese caso.
 */
async function assertStrategyMatches(
  db: Db,
  ctx: ServiceContext,
  strategyId: string,
  objectiveId: string | null,
  industryId: string | null,
): Promise<void> {
  const mismatch = () => new ServiceError(
    'invalid_input',
    422,
    msg(ctx.language, 'La estrategia no corresponde al objetivo e industria', 'Strategy does not match objective and industry'),
  );

  const { data: row } = await db
    .from('kefy_content_strategies')
    .select('id, objective_id, industry_id')
    .eq('id', strategyId)
    .maybeSingle();
  if (!row) throw mismatch();

  const exact =
    (!objectiveId || row.objective_id === objectiveId) &&
    (!industryId || row.industry_id === industryId);
  if (exact) return;

  if (objectiveId && industryId) {
    const preview = await previewStrategy(objectiveId, industryId);
    if (preview.strategy?.id === strategyId) return;
  }
  throw mismatch();
}

/**
 * Guarda (upsert) la selección de estrategia de la organización. Actualización
 * parcial: lo que no viene en `patch` se conserva.
 *
 * - `strategy_id` explícito → tiene que corresponder al par (fusionado).
 * - Sin `strategy_id` pero con objetivo e industria → se resuelve con
 *   previewStrategy (lo que hace la UI antes de guardar).
 * - `custom_strategy_id` → activa una estrategia propia (tiene que ser de la
 *   org). Elegir una del catálogo (`strategy_id` u `objective_id`) la
 *   desactiva; cambiar solo la industria (página Mercado) no.
 */
export async function setOrgStrategy(
  ctx: ServiceContext,
  patch: OrgStrategyPatch,
): Promise<{ selection: OrgStrategySelection }> {
  const { objective_id, industry_id, custom_notes, custom_strategy_id } = patch;
  let { strategy_id } = patch;

  if (
    !objective_id && !industry_id && !strategy_id &&
    custom_notes === undefined && custom_strategy_id === undefined
  ) {
    throw new ServiceError('invalid_input', 400, 'At least one field is required');
  }

  // La estrategia propia tiene que ser de esta org (404 si no).
  if (custom_strategy_id) await getCustomStrategy(ctx, custom_strategy_id);

  const supabase = createSupabaseServer();

  // Selección actual, para fusionar (actualización parcial).
  const { data: existing } = await supabase
    .from('kefy_org_strategies')
    .select('objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes')
    .eq('org_id', ctx.auth.orgId)
    .single();

  // Elegir una del catálogo desactiva la propia, salvo que venga otra propia.
  const choosesCatalog = strategy_id !== undefined || objective_id !== undefined;
  const customId: string | null =
    custom_strategy_id !== undefined
      ? custom_strategy_id
      : choosesCatalog ? null : (existing?.custom_strategy_id ?? null);

  const objectiveId: string | null = objective_id ?? existing?.objective_id ?? null;
  const industryId: string | null = industry_id ?? existing?.industry_id ?? null;

  if (strategy_id === undefined && objective_id && industry_id) {
    const preview = await previewStrategy(objective_id, industry_id);
    strategy_id = preview.strategy?.id ?? null;
  } else if (strategy_id) {
    await assertStrategyMatches(supabase, ctx, strategy_id, objectiveId, industryId);
  }

  const merged = {
    org_id:       ctx.auth.orgId,
    objective_id: objectiveId,
    industry_id:  industryId,
    strategy_id:  strategy_id  !== undefined ? (strategy_id ?? null)   : (existing?.strategy_id  ?? null),
    custom_strategy_id: customId,
    custom_notes: custom_notes !== undefined ? (custom_notes ?? null)  : (existing?.custom_notes ?? null),
    updated_at:   new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('kefy_org_strategies')
    .upsert(merged, { onConflict: 'org_id' })
    .select(SELECTION_COLUMNS)
    .single();

  if (error) throw dbError('Failed to save strategy selection', ctx, error);

  return { selection: data as OrgStrategySelection };
}

// ─── Estrategias propias: guardar y activar ──────────────────────────────────

/**
 * Crea (sin `id`) o edita (con `id`) una estrategia propia y, con `activate`,
 * la deja como la activa de la organización. Lo comparten la ruta
 * /api/strategies/custom y la herramienta save_custom_strategy.
 */
export async function saveCustomStrategy(
  ctx: ServiceContext,
  input: { id?: string | null; activate?: boolean } & Record<string, unknown>,
): Promise<{ strategy: CustomStrategy; selection: OrgStrategySelection | null }> {
  const { id, activate, ...fields } = input;
  const strategy = id
    ? await updateCustomStrategy(ctx, id, fields)
    : await createCustomStrategy(ctx, fields);

  if (!activate) return { strategy, selection: null };

  const { selection } = await setOrgStrategy(ctx, {
    custom_strategy_id: strategy.id,
    // El objetivo de la propia pasa a ser el de la org, si lo tiene.
    ...(strategy.objective_id ? { objective_id: strategy.objective_id } : {}),
  });
  return { strategy, selection };
}

// ─── Recomendaciones a partir de las plantillas ──────────────────────────────
// Movidos desde app/api/content/recommend/route.ts para compartirlos con
// get_content_ideas.

export type RecommendedContentType = 'post' | 'carousel' | 'reel' | 'story';
export type RecommendSource = 'strategy' | 'industry_fallback' | 'ai_only';

export interface Recommendation {
  template_id?:    string;
  week_num?:       number;
  post_num?:       number;
  format?:         string;
  topic:           string;
  content_type:    RecommendedContentType;
  slide_count?:    number;
  generate_images: true;
  rationale: {
    source:           RecommendSource;
    framework_name?:  string;
    kpi_primary?:     string;
    goal?:            string;
    week_num?:        number;
    post_num?:        number;
    rationale_short?: string;
  };
}

export interface StrategyCtx {
  framework_name?: string;
  kpi_primary?:    string;
  current_week?:   number;
  total_weeks?:    number;
  sample_topics?:  string[];
}

/** Traduce el `format` de una plantilla a un content_type soportado. */
export function formatToContentType(format: string | null): RecommendedContentType {
  const f = (format ?? '').toLowerCase();
  if (f.includes('historia') || f.includes('story') || f.includes('stories')) return 'story';
  if (f.includes('carrusel') || f.includes('carousel')) return 'carousel';
  if (f.includes('reel') || f.includes('video') || f.includes('short') || f.includes('tiktok')) return 'reel';
  return 'post';
}

/** Número de slides por defecto (solo carruseles). */
export function defaultSlideCount(type: RecommendedContentType): number | undefined {
  return type === 'carousel' ? 5 : undefined;
}

/**
 * Estrategia de respaldo para la industria escrita en el Brand Kit (por slug o
 * nombre). La industria es texto libre: se quitan los caracteres que tienen
 * significado en un filtro `.or()` de PostgREST.
 */
export async function findIndustryStrategyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  brandKitIndustry: string,
): Promise<string | null> {
  const industry = brandKitIndustry.replace(/[,()]/g, ' ').trim();
  if (!industry) return null;

  const { data: industryRow } = await db
    .from('kefy_content_industries')
    .select('id')
    .or(`slug.eq.${industry},name_es.ilike.${industry},name_en.ilike.${industry}`)
    .limit(1)
    .maybeSingle();
  if (!industryRow?.id) return null;

  const { data: fallbackStrat } = await db
    .from('kefy_content_strategies')
    .select('id')
    .eq('industry_id', industryRow.id)
    .limit(1)
    .maybeSingle();
  return fallbackStrat?.id ?? null;
}

/** Estrategia activa (del catálogo o propia) con sus plantillas, en ambos idiomas. */
interface StrategyBundle {
  framework_name_es: string | null;
  framework_name_en: string | null;
  kpi_primary_es:    string | null;
  kpi_primary_en:    string | null;
  templates:         StrategyTemplate[];
}

/** Qué estrategia leer: una propia de `orgId` o una del catálogo. */
export interface StrategyRef {
  strategyId?:       string | null;
  customStrategyId?: string | null;
  orgId?:            string;
}

async function loadStrategyBundle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ref: StrategyRef,
): Promise<StrategyBundle | null> {
  if (ref.customStrategyId && ref.orgId) {
    const custom = await loadCustomStrategyBundle(db, ref.orgId, ref.customStrategyId);
    if (custom) return custom;
  }
  if (!ref.strategyId) return null;

  const { data: strategy } = await db
    .from('kefy_content_strategies')
    .select('id, framework_name_es, framework_name_en, kpi_primary_es, kpi_primary_en')
    .eq('id', ref.strategyId)
    .maybeSingle();
  if (!strategy) return null;

  const { data: templates } = await db
    .from('kefy_strategy_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('strategy_id', ref.strategyId)
    .order('week_num', { ascending: true })
    .order('sort_order', { ascending: true });

  return {
    framework_name_es: strategy.framework_name_es ?? null,
    framework_name_en: strategy.framework_name_en ?? null,
    kpi_primary_es:    strategy.kpi_primary_es ?? null,
    kpi_primary_en:    strategy.kpi_primary_en ?? null,
    templates:         (templates ?? []) as StrategyTemplate[],
  };
}

interface LoadStrategyCtxOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:                any;
  orgStrategy:       {
    strategy_id: string | null;
    custom_strategy_id?: string | null;
    created_at: string | null;
  } | null;
  /** Necesario para leer una estrategia propia (siempre dentro de la org). */
  orgId?:            string;
  brandKitIndustry:  string | null;
  lang:              'es' | 'en';
}

/** Contexto de la estrategia activa para el prompt de recomendaciones (best-effort). */
export async function loadStrategyContext(opts: LoadStrategyCtxOpts): Promise<StrategyCtx | null> {
  const { db, orgStrategy, orgId, brandKitIndustry, lang } = opts;

  let strategyId: string | null = orgStrategy?.strategy_id ?? null;
  const customStrategyId: string | null = orgStrategy?.custom_strategy_id ?? null;
  const createdAt: string | null = orgStrategy?.created_at ?? null;

  // Sin estrategia explícita, se intenta por la industria del kit.
  if (!strategyId && !customStrategyId && brandKitIndustry) {
    strategyId = await findIndustryStrategyId(db, brandKitIndustry);
  }

  const strategy = await loadStrategyBundle(db, { strategyId, customStrategyId, orgId });
  if (!strategy) return null;

  const tpls = strategy.templates;
  const totalWeeks = tpls.length > 0 ? Math.max(1, ...tpls.map((t) => t.week_num)) : 1;

  let currentWeek = 1;
  if (createdAt) {
    const weeksElapsed = Math.floor(
      (Date.now() - new Date(createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    currentWeek = ((weeksElapsed % totalWeeks) + totalWeeks) % totalWeeks + 1;
  }

  const sampleTopics = tpls
    .filter((t) => t.week_num === currentWeek)
    .map((t) => (lang === 'en' ? t.topic_en : t.topic_es) ?? '')
    .filter((s) => s.length > 0);

  return {
    framework_name: (lang === 'en' ? strategy.framework_name_en : strategy.framework_name_es) ?? undefined,
    kpi_primary:    (lang === 'en' ? strategy.kpi_primary_en    : strategy.kpi_primary_es)    ?? undefined,
    current_week:   currentWeek,
    total_weeks:    totalWeeks,
    sample_topics:  sampleTopics,
  };
}

interface LoadStrategyOpts extends StrategyRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:             any;
  createdAt:      string | null;
  offset:         number;
  lang:           'es' | 'en';
  isAlreadyUsed:  (topic: string) => boolean;
  source:         'strategy' | 'industry_fallback';
}

export interface StrategyRecommendations {
  recommendations: Recommendation[];
  source: RecommendSource;
  strategy_meta: {
    framework_name: string;
    kpi_primary:    string;
    current_week:   number;
    total_weeks:    number;
  } | null;
}

/** Tres ideas desde las plantillas de una estrategia, empezando por la semana en curso. */
export async function loadStrategyRecommendations(opts: LoadStrategyOpts): Promise<StrategyRecommendations | null> {
  const { db, createdAt, offset, lang, isAlreadyUsed, source } = opts;

  const strategy = await loadStrategyBundle(db, opts);
  if (!strategy) return null;

  const tpls: StrategyTemplate[] = strategy.templates;
  if (tpls.length === 0) return null;

  // Semanas que tiene la estrategia.
  const totalWeeks = Math.max(1, ...tpls.map((t) => t.week_num));

  // Semana en curso: semanas desde que la organización aceptó la estrategia, en ciclo.
  let currentWeek = 1;
  if (createdAt) {
    const weeksElapsed = Math.floor(
      (Date.now() - new Date(createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    currentWeek = ((weeksElapsed % totalWeeks) + totalWeeks) % totalWeeks + 1;
  }

  // Secuencia en orden de calendario desde la semana en curso, dando la vuelta.
  const ordered: StrategyTemplate[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = ((currentWeek - 1 + w) % totalWeeks) + 1;
    const weekTpls = tpls.filter((t) => t.week_num === weekNum);
    ordered.push(...weekTpls);
  }

  // Fuera las plantillas cuyo tema ya está en el contenido reciente.
  const fresh = ordered.filter((t) => {
    const topic = lang === 'en' ? t.topic_en : t.topic_es;
    return topic && !isAlreadyUsed(topic);
  });

  // Desde `offset`, dando la vuelta si no alcanza.
  const pool = fresh.length > 0 ? fresh : ordered;
  const picked: StrategyTemplate[] = [];
  for (let i = 0; i < 3 && i < pool.length; i++) {
    picked.push(pool[(offset + i) % pool.length]);
  }

  const frameworkName = (lang === 'en' ? strategy.framework_name_en : strategy.framework_name_es) ?? '';
  const kpiPrimary    = (lang === 'en' ? strategy.kpi_primary_en    : strategy.kpi_primary_es)    ?? '';

  const recommendations: Recommendation[] = picked.map((t) => {
    const topic = (lang === 'en' ? t.topic_en : t.topic_es) ?? '';
    const goal  = (lang === 'en' ? t.goal_en  : t.goal_es)  ?? '';
    const contentType = formatToContentType(t.format);
    return {
      template_id:     t.id,
      week_num:        t.week_num,
      post_num:        t.post_num,
      format:          t.format ?? undefined,
      topic,
      content_type:    contentType,
      slide_count:     defaultSlideCount(contentType),
      generate_images: true,
      rationale: {
        source,
        framework_name: frameworkName,
        kpi_primary:    kpiPrimary,
        goal,
        week_num:       t.week_num,
        post_num:       t.post_num,
      },
    };
  });

  if (recommendations.length === 0) return null;

  return {
    recommendations,
    source,
    strategy_meta: {
      framework_name: frameworkName,
      kpi_primary:    kpiPrimary,
      current_week:   currentWeek,
      total_weeks:    totalWeeks,
    },
  };
}

// ─── Ideas de contenido (herramienta get_content_ideas) ──────────────────────

export interface ContentIdea {
  topic: string;
  content_type: RecommendedContentType;
  format: string | null;
  slide_count: number | null;
  goal: string | null;
  week_num: number | null;
}

export type StrategyIdeas =
  | {
      ideas: ContentIdea[];
      source: 'strategy' | 'industry_fallback';
      strategy: StrategyRecommendations['strategy_meta'];
    }
  | { ideas: []; hint: 'no_strategy' };

/**
 * Ideas de esta semana desde el calendario de la estrategia activa (o la de la
 * industria del Brand Kit). Solo plantillas: no llama a la IA ni gasta nada.
 * `offset` rota por el calendario.
 */
export async function getStrategyIdeas(
  ctx: ServiceContext,
  opts: { offset?: number } = {},
): Promise<StrategyIdeas> {
  const db = createSupabaseServer();
  const lang = ctx.language;
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));

  let recentQ = db
    .from('kefy_content_items')
    .select('body, title')
    .eq('org_id', ctx.auth.orgId);
  if (ctx.brandScope === 'strict') recentQ = recentQ.eq('brand_id', ctx.brandId);

  const [{ data: brandKit }, { data: orgStrategy }, { data: recentItems }] = await Promise.all([
    getBrandKitForBrand(db, ctx.brandId),
    db
      .from('kefy_org_strategies')
      .select('strategy_id, custom_strategy_id, industry_id, created_at')
      .eq('org_id', ctx.auth.orgId)
      .maybeSingle(),
    recentQ.order('created_at', { ascending: false }).limit(30),
  ]);

  const recentBlob = ((recentItems ?? []) as Array<{ title: string | null; body: string | null }>)
    .map((i) => `${i.title ?? ''}\n${i.body ?? ''}`.toLowerCase())
    .join('\n');

  const isAlreadyUsed = (topic: string): boolean => {
    const t = topic.toLowerCase().trim();
    if (t.length < 30) return false;
    return recentBlob.includes(t.slice(0, 30));
  };

  let result: StrategyRecommendations | null = null;

  if (orgStrategy?.strategy_id || orgStrategy?.custom_strategy_id) {
    result = await loadStrategyRecommendations({
      db,
      strategyId:       orgStrategy.strategy_id,
      customStrategyId: orgStrategy.custom_strategy_id,
      orgId:            ctx.auth.orgId,
      createdAt:  orgStrategy.created_at,
      offset,
      lang,
      isAlreadyUsed,
      source: 'strategy',
    });
  }

  if (!result && brandKit?.industry) {
    const fallbackId = await findIndustryStrategyId(db, brandKit.industry);
    if (fallbackId) {
      result = await loadStrategyRecommendations({
        db,
        strategyId: fallbackId,
        createdAt:  null,
        offset,
        lang,
        isAlreadyUsed,
        source: 'industry_fallback',
      });
    }
  }

  if (!result) return { ideas: [], hint: 'no_strategy' };

  return {
    ideas: result.recommendations.map((r) => ({
      topic: r.topic,
      content_type: r.content_type,
      format: r.format ?? null,
      slide_count: r.slide_count ?? null,
      goal: r.rationale.goal || null,
      week_num: r.week_num ?? null,
    })),
    source: result.source === 'industry_fallback' ? 'industry_fallback' : 'strategy',
    strategy: result.strategy_meta,
  };
}
