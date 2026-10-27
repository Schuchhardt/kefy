import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import { checkRateLimit, aiRule, rateLimitResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import { generateContentRecommendations } from '@/lib/ai';

// Las plantillas y el contexto de la estrategia activa de la marca (del
// catálogo o propia de la org) salen de lib/services/strategy.ts, igual que
// get_content_ideas. Todo se lee para la marca activa (cookie): cada marca
// tiene su Brand Kit y su estrategia.
import {
  defaultSlideCount,
  findIndustryStrategyId,
  loadStrategyContext,
  loadStrategyRecommendations,
  type Recommendation,
  type RecommendSource,
} from '@/lib/services/strategy';

// GET /api/content/recommend?offset=N&lang=es|en&hint=...
// Auth required — returns 3 channel-agnostic content recommendations driven by:
//   1. If `hint` is provided → Claude-generated ideas guided by the comment
//      (brand kit + active strategy context are passed in for grounding).
//   2. Otherwise, `offset === 0` → first batch from the brand's active strategy
//      template (or industry-matched strategy as fallback).
//   3. Otherwise (`offset > 0`) → Claude-generated ideas, grounded with the
//      active strategy context so users keep getting fresh content instead of
//      cycling through the same calendar.
//
// `offset` lets the UI rotate through fresh AI ideas after the initial
// strategy-driven batch ("Recomendar otro").
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const offset   = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0);
  const langRaw  = searchParams.get('lang');
  const lang: 'es' | 'en' = langRaw === 'en' ? 'en' : 'es';

  // Solo rate limit, sin cuota mensual: recomendar es una lectura que dispara
  // la UI, y descontarla de la cuota de creación castigaría al usuario por
  // navegar. El límite por minuto basta para frenar el «recomendar otro» en bucle.
  const limit = await checkRateLimit(aiRule(auth.orgId));
  if (!limit.allowed) {
    return rateLimitResponse(
      limit,
      lang === 'en'
        ? 'Too many requests. Wait a moment.'
        : 'Demasiadas peticiones. Espera un momento.',
    );
  }

  const hint     = (searchParams.get('hint') ?? '').trim().slice(0, 500);

  const { brand } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const db = createSupabaseServer();

  const [
    // 1. Brand kit (industry + audience context)
    { data: brandKit },
    // 2. The brand's selected strategy (if any)
    { data: orgStrategy },
    // 3. Recent content of the brand to dedupe (last 30 items)
    { data: recentItems },
  ] = await Promise.all([
    getBrandKitForBrand(db, brand.id),
    db
      .from('kefy_org_strategies')
      .select('strategy_id, custom_strategy_id, industry_id, created_at')
      .eq('org_id', auth.orgId)
      .eq('brand_id', brand.id)
      .maybeSingle(),
    db
      .from('kefy_content_items')
      .select('body, title')
      .eq('org_id', auth.orgId)
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const recentBlob = (recentItems ?? [])
    .map((i) => `${i.title ?? ''}\n${i.body ?? ''}`.toLowerCase())
    .join('\n');

  const recentTopics = (recentItems ?? [])
    .map((i) => (i.title ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 10);

  const isAlreadyUsed = (topic: string): boolean => {
    const t = topic.toLowerCase().trim();
    if (t.length < 30) return false;
    // Use the first 30 chars as a fingerprint
    return recentBlob.includes(t.slice(0, 30));
  };

  // ─── Shortcut: when the user provides a hint, always go through Claude so ──
  // it can steer the ideas around the comment. Strategy context (if any) is
  // attached for grounding but does not override the user's guidance.
  if (hint.length > 0) {
    const strategyCtx = await loadStrategyContext({
      db,
      orgStrategy,
      orgId: auth.orgId,
      brandKitIndustry: brandKit?.industry ?? null,
      lang,
    });

    return runAiRecommendations({
      brandKit,
      lang,
      hint,
      strategyCtx,
      recentTopics,
    });
  }

  // ─── First batch (offset === 0): serve the active strategy templates ──────
  // Subsequent rotations (offset > 0) always go through Claude so users keep
  // getting fresh ideas instead of cycling through the same calendar.
  if (offset === 0) {
    // Case A: the brand has an active strategy (catalog or the org's own)
    if (orgStrategy?.strategy_id || orgStrategy?.custom_strategy_id) {
      const strategyResult = await loadStrategyRecommendations({
        db,
        strategyId:       orgStrategy.strategy_id,
        customStrategyId: orgStrategy.custom_strategy_id,
        orgId:            auth.orgId,
        createdAt:  orgStrategy.created_at,
        offset,
        lang,
        isAlreadyUsed,
        source: 'strategy',
      });

      if (strategyResult) return NextResponse.json(strategyResult);
    }

    // Case B: no strategy but brand kit has an industry
    if (brandKit?.industry) {
      const fallbackId = await findIndustryStrategyId(db, brandKit.industry);
      if (fallbackId) {
        const fallbackResult = await loadStrategyRecommendations({
          db,
          strategyId: fallbackId,
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

  // ─── Default path: Claude, grounded with the active strategy context ──────
  const strategyCtx = await loadStrategyContext({
    db,
    orgStrategy,
    orgId: auth.orgId,
    brandKitIndustry: brandKit?.industry ?? null,
    lang,
  });

  return runAiRecommendations({
    brandKit,
    lang,
    hint:        '',
    strategyCtx,
    recentTopics,
  });
}

// ─── Helper: run the Claude-backed recommendation path ───────────────────────

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

interface StrategyCtx {
  framework_name?: string;
  kpi_primary?:    string;
  current_week?:   number;
  total_weeks?:    number;
  sample_topics?:  string[];
}

interface AiRunOpts {
  brandKit:     BrandKitRow;
  lang:         'es' | 'en';
  hint:         string;
  strategyCtx:  StrategyCtx | null;
  recentTopics: string[];
}

async function runAiRecommendations(opts: AiRunOpts): Promise<NextResponse> {
  const { brandKit, lang, hint, strategyCtx, recentTopics } = opts;
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
      hint:            hint || undefined,
      strategy:        strategyCtx ?? undefined,
      recent_topics:   recentTopics.length > 0 ? recentTopics : undefined,
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
      strategy_meta: strategyCtx && strategyCtx.framework_name
        ? {
            framework_name: strategyCtx.framework_name,
            kpi_primary:    strategyCtx.kpi_primary    ?? '',
            current_week:   strategyCtx.current_week   ?? 1,
            total_weeks:    strategyCtx.total_weeks    ?? 1,
          }
        : null,
    });
  } catch (err) {
    reportError(err, { route: 'GET /api/content/recommend', service: 'ai' });
    const msg = err instanceof Error ? err.message : 'AI recommendation failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

