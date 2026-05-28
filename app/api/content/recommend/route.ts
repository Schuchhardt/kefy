import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { generateContentRecommendations } from '@/lib/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

type RecommendedContentType = 'post' | 'carousel' | 'reel';
type RecommendSource = 'strategy' | 'industry_fallback' | 'ai_only';

interface Recommendation {
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

interface StrategyTemplate {
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

// Map a template `format` to the supported content_type values
function formatToContentType(format: string | null): RecommendedContentType {
  const f = (format ?? '').toLowerCase();
  if (f.includes('carrusel') || f.includes('carousel')) return 'carousel';
  if (f.includes('reel') || f.includes('video') || f.includes('short') || f.includes('tiktok')) return 'reel';
  return 'post';
}

// Default slide count by content_type (carousels only)
function defaultSlideCount(type: RecommendedContentType): number | undefined {
  return type === 'carousel' ? 5 : undefined;
}

// GET /api/content/recommend?offset=N&lang=es|en
// Auth required — returns 3 channel-agnostic content recommendations driven by:
//   1. Org's active strategy (kefy_org_strategies → kefy_strategy_templates), or
//   2. Industry match in kefy_content_strategies (fallback), or
//   3. Claude-generated ideas from the Brand Kit (last resort)
//
// `offset` lets the UI rotate through the calendar / catalog for "Recomendar otro".
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const offset   = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0);
  const langRaw  = searchParams.get('lang');
  const lang: 'es' | 'en' = langRaw === 'en' ? 'en' : 'es';

  const db = createSupabaseServer();

  // 1. Load brand kit (industry + audience context)
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select(
      `id, name, tagline, industry, niche, target_audience, mission,
       differentiators, tone, communication_style`,
    )
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 2. Load org's selected strategy (if any)
  const { data: orgStrategy } = await db
    .from('kefy_org_strategies')
    .select('strategy_id, industry_id, created_at')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 3. Load recent content to dedupe (last 30 items)
  const { data: recentItems } = await db
    .from('kefy_content_items')
    .select('body, title')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(30);

  const recentBlob = (recentItems ?? [])
    .map((i) => `${i.title ?? ''}\n${i.body ?? ''}`.toLowerCase())
    .join('\n');

  const isAlreadyUsed = (topic: string): boolean => {
    const t = topic.toLowerCase().trim();
    if (t.length < 30) return false;
    // Use the first 30 chars as a fingerprint
    return recentBlob.includes(t.slice(0, 30));
  };

  // ─── Case A: org has a strategy_id ──────────────────────────────────────────
  if (orgStrategy?.strategy_id) {
    const strategyResult = await loadStrategyRecommendations({
      db,
      strategyId: orgStrategy.strategy_id,
      createdAt:  orgStrategy.created_at,
      offset,
      lang,
      isAlreadyUsed,
      source: 'strategy',
    });

    if (strategyResult) return NextResponse.json(strategyResult);
  }

  // ─── Case B: no strategy but brand kit has an industry ──────────────────────
  if (brandKit?.industry) {
    // Match industry by slug or name (case-insensitive)
    const { data: industryRow } = await db
      .from('kefy_content_industries')
      .select('id')
      .or(`slug.eq.${brandKit.industry},name_es.ilike.${brandKit.industry},name_en.ilike.${brandKit.industry}`)
      .limit(1)
      .maybeSingle();

    if (industryRow?.id) {
      const { data: fallbackStrat } = await db
        .from('kefy_content_strategies')
        .select('id')
        .eq('industry_id', industryRow.id)
        .limit(1)
        .maybeSingle();

      if (fallbackStrat?.id) {
        const fallbackResult = await loadStrategyRecommendations({
          db,
          strategyId: fallbackStrat.id,
          createdAt:  null,
          offset,
          lang,
          isAlreadyUsed,
          source: 'industry_fallback',
        });

        if (fallbackResult) return NextResponse.json(fallbackResult);
      }
    }
  }

  // ─── Case C: AI-only fallback ───────────────────────────────────────────────
  try {
    const ai = await generateContentRecommendations({
      name:            brandKit?.name ?? undefined,
      tagline:         brandKit?.tagline ?? undefined,
      industry:        brandKit?.industry ?? undefined,
      niche:           brandKit?.niche ?? undefined,
      target_audience: brandKit?.target_audience ?? undefined,
      mission:         brandKit?.mission ?? undefined,
      differentiators: brandKit?.differentiators ?? undefined,
      tone:            brandKit?.tone ?? undefined,
      language:        lang,
    }, 3);

    const recommendations: Recommendation[] = ai.recommendations.map((r) => ({
      topic:           r.topic,
      content_type:    r.content_type,
      slide_count:     defaultSlideCount(r.content_type),
      generate_images: true,
      rationale: {
        source:           'ai_only',
        rationale_short:  r.rationale_short,
      },
    }));

    return NextResponse.json({
      recommendations,
      source: 'ai_only' as RecommendSource,
      strategy_meta: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI recommendation failed';
    console.error('[api/content/recommend] AI fallback error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ─── Helper: build recommendations from a strategy + its templates ────────────

interface LoadStrategyOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:             any;
  strategyId:     string;
  createdAt:      string | null;
  offset:         number;
  lang:           'es' | 'en';
  isAlreadyUsed:  (topic: string) => boolean;
  source:         'strategy' | 'industry_fallback';
}

async function loadStrategyRecommendations(opts: LoadStrategyOpts): Promise<{
  recommendations: Recommendation[];
  source: RecommendSource;
  strategy_meta: {
    framework_name: string;
    kpi_primary:    string;
    current_week:   number;
    total_weeks:    number;
  } | null;
} | null> {
  const { db, strategyId, createdAt, offset, lang, isAlreadyUsed, source } = opts;

  const { data: strategy } = await db
    .from('kefy_content_strategies')
    .select(
      `id, framework_name_es, framework_name_en,
       kpi_primary_es, kpi_primary_en`,
    )
    .eq('id', strategyId)
    .single();

  if (!strategy) return null;

  const { data: templates } = await db
    .from('kefy_strategy_templates')
    .select(
      `id, week_num, post_num, format, channel_hint,
       topic_es, copy_structure_es, goal_es,
       topic_en, copy_structure_en, goal_en, sort_order`,
    )
    .eq('strategy_id', strategyId)
    .order('week_num', { ascending: true })
    .order('sort_order', { ascending: true });

  const tpls: StrategyTemplate[] = templates ?? [];
  if (tpls.length === 0) return null;

  // Compute total weeks present in this strategy
  const totalWeeks = Math.max(1, ...tpls.map((t) => t.week_num));

  // Compute current_week: weeks since org accepted the strategy, wrapped
  let currentWeek = 1;
  if (createdAt) {
    const weeksElapsed = Math.floor(
      (Date.now() - new Date(createdAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    currentWeek = ((weeksElapsed % totalWeeks) + totalWeeks) % totalWeeks + 1;
  }

  // Build a calendar-ordered sequence starting from currentWeek, wrapping around
  const ordered: StrategyTemplate[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const weekNum = ((currentWeek - 1 + w) % totalWeeks) + 1;
    const weekTpls = tpls.filter((t) => t.week_num === weekNum);
    ordered.push(...weekTpls);
  }

  // Filter out templates whose topic is already in recent content
  const fresh = ordered.filter((t) => {
    const topic = lang === 'en' ? t.topic_en : t.topic_es;
    return topic && !isAlreadyUsed(topic);
  });

  // Slice from offset, wrap around if not enough
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
