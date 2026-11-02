// ─── Servicio: recomendaciones de contenido ──────────────────────────────────
//
// Lógica de GET /api/content/recommend («Recomendación inteligente» en
// Crear contenido).
//
// Una marca que ya tiene contenido no recibe las plantillas genéricas de su
// estrategia («Por qué [práctica común en la industria] está mal…»): recibe
// ideas que continúan los temas que ya trató, con más peso en lo último y en
// lo que mejor funcionó según las métricas. La estrategia activa sigue
// mandando, pero como lente (framework, KPI, ángulos de la semana) que la IA
// aplica sobre ese historial, no como texto que se muestra tal cual.
//
// Una marca sin contenido sigue recibiendo el calendario de su estrategia (o el
// de su industria) en la primera tanda, y la IA en las siguientes.
//
// Recomendar es una lectura que dispara la UI: solo rate limit, sin descontar
// créditos (ver docs/beta-abierta.md). El límite por minuto frena el «Otras
// ideas» en bucle.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { checkRateLimit, aiRule, rateLimitBody, rateLimitHeaders } from '@/lib/rate-limit';
import { generateContentRecommendations } from '@/lib/ai';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import {
  defaultSlideCount,
  findIndustryStrategyId,
  loadStrategyContext,
  loadStrategyRecommendations,
  type Recommendation,
  type RecommendSource,
  type StrategyCtx,
  type StrategyRecommendations,
} from '@/lib/services/strategy';
import type { ContentHistoryEntry } from '@/types/ai';

type Db = ReturnType<typeof createSupabaseServer>;

const ROUTE = 'lib/services/recommendations';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Piezas recientes que se le pasan a la IA. */
const HISTORY_LIMIT = 15;
/** Cuántas piezas se marcan como «mejor rendimiento». */
const TOP_LIMIT = 3;
/** Alcance mínimo para que la tasa de interacción signifique algo. */
const MIN_REACH_FOR_RATE = 20;

export type { ContentHistoryEntry };

// ─── Historial de la marca ───────────────────────────────────────────────────

interface ContentRow {
  id:           string;
  title:        string | null;
  body:         string | null;
  content_type: string | null;
  status:       string;
  created_at:   string;
}

interface MetricRow {
  measured_at: string;
  impressions: number;
  reach:       number;
  likes:       number;
  comments:    number;
  shares:      number;
  saves:       number;
}

interface ScheduledRow {
  id:              string;
  content_item_id: string;
  published_at:    string | null;
  kefy_post_metrics: MetricRow[] | null;
}

/** Tema legible de una pieza: su título o el arranque del texto. */
function topicOf(row: Pick<ContentRow, 'title' | 'body'>): string {
  const title = (row.title ?? '').trim();
  if (title.length >= 12) return title.slice(0, 160);
  const body = (row.body ?? '').replace(/\s+/g, ' ').trim();
  const text = title ? `${title} — ${body}` : body;
  return text.slice(0, 160);
}

function normalizeType(t: string | null): ContentHistoryEntry['content_type'] {
  return t === 'carousel' || t === 'reel' || t === 'story' ? t : 'post';
}

/**
 * Las últimas piezas de la marca (sin archivadas), de la más nueva a la más
 * vieja, con las métricas de sus publicaciones sumadas por pieza y las de
 * mejor rendimiento marcadas. Best-effort: si falla la lectura de métricas, se
 * devuelve el historial sin ellas.
 */
export async function loadContentHistory(
  db: Db,
  ctx: ServiceContext,
  limit = HISTORY_LIMIT,
): Promise<ContentHistoryEntry[]> {
  const { data: items, error } = await db
    .from('kefy_content_items')
    .select('id, title, body, content_type, status, created_at')
    .eq('org_id', ctx.auth.orgId)
    .eq('brand_id', ctx.brandId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    reportError(new Error(error.message), {
      route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { op: 'history' },
    });
    return [];
  }

  const rows = ((items ?? []) as ContentRow[]).filter((r) => topicOf(r).length >= 8);
  if (rows.length === 0) return [];

  // Métricas: la última medición de cada publicación, sumada por pieza.
  const perItem = new Map<string, {
    impressions: number; reach: number; engagements: number; published_at: string | null;
  }>();

  const { data: posts, error: postsError } = await db
    .from('kefy_scheduled_posts')
    .select(`
      id, content_item_id, published_at,
      kefy_post_metrics ( measured_at, impressions, reach, likes, comments, shares, saves )
    `)
    .eq('org_id', ctx.auth.orgId)
    .eq('status', 'published')
    .in('content_item_id', rows.map((r) => r.id));

  if (postsError) {
    reportError(new Error(postsError.message), {
      route: ROUTE, service: 'supabase', auth: ctx.auth, extra: { op: 'history_metrics' },
    });
  }

  for (const p of (posts ?? []) as ScheduledRow[]) {
    const acc = perItem.get(p.content_item_id) ?? {
      impressions: 0, reach: 0, engagements: 0, published_at: null,
    };
    if (p.published_at && (!acc.published_at || p.published_at < acc.published_at)) {
      acc.published_at = p.published_at;
    }
    const latest = (p.kefy_post_metrics ?? [])
      .slice()
      .sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1))[0];
    if (latest) {
      acc.impressions += latest.impressions ?? 0;
      acc.reach       += latest.reach ?? 0;
      acc.engagements += (latest.likes ?? 0) + (latest.comments ?? 0)
        + (latest.shares ?? 0) + (latest.saves ?? 0);
    }
    perItem.set(p.content_item_id, acc);
  }

  const now = Date.now();
  const history: ContentHistoryEntry[] = rows.map((r) => {
    const m = perItem.get(r.id);
    const hasMetrics = !!m && (m.impressions > 0 || m.reach > 0 || m.engagements > 0);
    const when = m?.published_at ?? r.created_at;
    return {
      topic:        topicOf(r),
      content_type: normalizeType(r.content_type),
      published:    r.status === 'published' || !!m?.published_at,
      age_days:     Math.max(0, Math.floor((now - new Date(when).getTime()) / DAY_MS)),
      metrics: hasMetrics
        ? {
            impressions:     m.impressions,
            reach:           m.reach,
            engagements:     m.engagements,
            engagement_rate: m.reach > 0 ? Math.round((m.engagements / m.reach) * 1000) / 10 : null,
          }
        : null,
      top_performer: false,
    };
  });

  markTopPerformers(history);
  return history;
}

/**
 * Marca como «mejor rendimiento» las piezas que más interacción consiguieron.
 * Solo tiene sentido comparando: hacen falta al menos dos piezas con métricas.
 * Con alcance suficiente se ordena por tasa de interacción; si no, por
 * interacciones y luego impresiones.
 */
export function markTopPerformers(history: ContentHistoryEntry[]): void {
  const measured = history.filter((h) => h.metrics);
  if (measured.length < 2) return;

  const score = (h: ContentHistoryEntry): [number, number, number] => {
    const m = h.metrics!;
    const rate = m.reach >= MIN_REACH_FOR_RATE && m.engagement_rate !== null ? m.engagement_rate : -1;
    return [rate, m.engagements, m.impressions];
  };

  const ranked = measured.slice().sort((a, b) => {
    const sa = score(a); const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sb[i] - sa[i];
    }
    return 0;
  });

  // La mitad superior, como mucho TOP_LIMIT, y nunca una pieza sin interacción.
  const take = Math.min(TOP_LIMIT, Math.max(1, Math.floor(ranked.length / 2)));
  for (const h of ranked.slice(0, take)) {
    if (h.metrics!.engagements > 0 || h.metrics!.impressions > 0) h.top_performer = true;
  }
}

// ─── Recomendaciones ─────────────────────────────────────────────────────────

export interface RecommendInput {
  /** Rota las ideas («Otras ideas»). */
  offset?: number;
  /** Pista opcional del usuario; manda sobre todo lo demás. */
  hint?: string;
}

export type ContentRecommendations = StrategyRecommendations;

function strategyMeta(ctx: StrategyCtx | null): StrategyRecommendations['strategy_meta'] {
  return ctx && ctx.framework_name
    ? {
        framework_name: ctx.framework_name,
        kpi_primary:    ctx.kpi_primary  ?? '',
        current_week:   ctx.current_week ?? 1,
        total_weeks:    ctx.total_weeks  ?? 1,
      }
    : null;
}

/**
 * Tres ideas de contenido para la marca del contexto:
 *
 *   1. Con historial → siempre IA, anclada a lo que la marca ya publicó (más
 *      peso en lo último y en lo que mejor funcionó), aplicando la estrategia
 *      activa como lente. Fuente `history`.
 *   2. Sin historial y con pista → IA guiada por la pista. Fuente `ai_only`.
 *   3. Sin historial, primera tanda → plantillas de la estrategia activa o de
 *      la industria del Brand Kit. Fuente `strategy` / `industry_fallback`.
 *   4. Si no, IA con la estrategia como contexto. Fuente `ai_only`.
 */
export async function recommendContent(
  ctx: ServiceContext,
  input: RecommendInput = {},
): Promise<ContentRecommendations> {
  const lang = ctx.language;
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const hint = (input.hint ?? '').trim().slice(0, 500);

  const limit = await checkRateLimit(aiRule(ctx.auth.orgId));
  if (!limit.allowed) {
    const message = lang === 'en' ? 'Too many requests. Wait a moment.' : 'Demasiadas peticiones. Espera un momento.';
    throw new ServiceError(
      'rate_limited', 429, message, rateLimitBody(limit, message), rateLimitHeaders(limit),
    );
  }

  const db = createSupabaseServer();

  const [{ data: brandKit }, { data: orgStrategy }, history] = await Promise.all([
    getBrandKitForBrand(db, ctx.brandId),
    db
      .from('kefy_org_strategies')
      .select('strategy_id, custom_strategy_id, industry_id, created_at')
      .eq('org_id', ctx.auth.orgId)
      .eq('brand_id', ctx.brandId)
      .maybeSingle(),
    loadContentHistory(db, ctx),
  ]);

  const strategyContext = () => loadStrategyContext({
    db,
    orgStrategy,
    orgId: ctx.auth.orgId,
    brandKitIndustry: brandKit?.industry ?? null,
    lang,
  });

  // 1. La marca ya tiene contenido: se construye sobre él.
  if (history.length > 0) {
    const strategyCtx = await strategyContext();
    return runAi(ctx, { brandKit, hint, strategyCtx, history, offset, source: 'history' });
  }

  // 2. Sin historial, con pista.
  if (hint.length > 0) {
    const strategyCtx = await strategyContext();
    return runAi(ctx, { brandKit, hint, strategyCtx, history, offset, source: 'ai_only' });
  }

  // 3. Sin historial, primera tanda: el calendario de la estrategia.
  if (offset === 0) {
    const neverUsed = () => false;

    if (orgStrategy?.strategy_id || orgStrategy?.custom_strategy_id) {
      const result = await loadStrategyRecommendations({
        db,
        strategyId:       orgStrategy.strategy_id,
        customStrategyId: orgStrategy.custom_strategy_id,
        orgId:            ctx.auth.orgId,
        createdAt:        orgStrategy.created_at,
        offset,
        lang,
        isAlreadyUsed:    neverUsed,
        source:           'strategy',
      });
      if (result) return result;
    }

    if (brandKit?.industry) {
      const fallbackId = await findIndustryStrategyId(db, brandKit.industry);
      if (fallbackId) {
        const result = await loadStrategyRecommendations({
          db,
          strategyId:    fallbackId,
          createdAt:     null,
          offset,
          lang,
          isAlreadyUsed: neverUsed,
          source:        'industry_fallback',
        });
        if (result) return result;
      }
    }
  }

  // 4. IA con la estrategia como contexto.
  const strategyCtx = await strategyContext();
  return runAi(ctx, { brandKit, hint, strategyCtx, history, offset, source: 'ai_only' });
}

type BrandKitRow = {
  name?:            string | null;
  tagline?:         string | null;
  industry?:        string | null;
  niche?:           string | null;
  target_audience?: string | null;
  mission?:         string | null;
  differentiators?: string[] | null;
  tone?:            string[] | null;
} | null;

async function runAi(
  ctx: ServiceContext,
  opts: {
    brandKit:    BrandKitRow;
    hint:        string;
    strategyCtx: StrategyCtx | null;
    history:     ContentHistoryEntry[];
    offset:      number;
    source:      Extract<RecommendSource, 'history' | 'ai_only'>;
  },
): Promise<ContentRecommendations> {
  const { brandKit, hint, strategyCtx, history, offset, source } = opts;

  let ai;
  try {
    ai = await generateContentRecommendations({
      name:            brandKit?.name ?? undefined,
      tagline:         brandKit?.tagline ?? undefined,
      industry:        brandKit?.industry ?? undefined,
      niche:           brandKit?.niche ?? undefined,
      target_audience: brandKit?.target_audience ?? undefined,
      mission:         brandKit?.mission ?? undefined,
      differentiators: brandKit?.differentiators ?? undefined,
      tone:            brandKit?.tone ?? undefined,
      language:        ctx.language,
      hint:            hint || undefined,
      strategy:        strategyCtx ?? undefined,
      history:         history.length > 0 ? history : undefined,
      rotation:        offset,
    }, 3);
  } catch (err) {
    reportError(err, { route: ROUTE, service: 'ai', auth: ctx.auth });
    throw new ServiceError(
      'unavailable',
      502,
      ctx.language === 'en'
        ? 'Could not generate recommendations. Try again.'
        : 'No pudimos generar recomendaciones. Intenta de nuevo.',
    ).markReported();
  }

  const recommendations: Recommendation[] = ai.recommendations.map((r) => ({
    topic:           r.topic,
    content_type:    r.content_type,
    slide_count:     defaultSlideCount(r.content_type),
    generate_images: true,
    rationale: {
      source,
      framework_name:  strategyCtx?.framework_name,
      kpi_primary:     strategyCtx?.kpi_primary,
      rationale_short: r.rationale_short,
    },
  }));

  return { recommendations, source, strategy_meta: strategyMeta(strategyCtx) };
}
