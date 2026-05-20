import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// GET /api/strategies/recommend?objective_id=UUID&industry_id=UUID
// Auth required — returns the matched strategy + its weekly templates
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const objective_id = searchParams.get('objective_id');
  const industry_id = searchParams.get('industry_id');

  if (!objective_id || !industry_id) {
    return NextResponse.json(
      { error: 'objective_id and industry_id are required' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  const { data: strategy, error: stratError } = await supabase
    .from('kefy_content_strategies')
    .select(
      `id, framework_slug, framework_name_es, framework_name_en,
       framework_desc_es, framework_desc_en,
       kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
       interaction_layers, cta_mechanic_es, cta_mechanic_en`,
    )
    .eq('objective_id', objective_id)
    .eq('industry_id', industry_id)
    .single();

  if (stratError || !strategy) {
    // No exact match — fallback: any strategy for this industry (any objective)
    const { data: fallbackStrat } = await supabase
      .from('kefy_content_strategies')
      .select(
        `id, framework_slug, framework_name_es, framework_name_en,
         framework_desc_es, framework_desc_en,
         kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
         interaction_layers, cta_mechanic_es, cta_mechanic_en, objective_id`,
      )
      .eq('industry_id', industry_id)
      .limit(1)
      .single();

    if (!fallbackStrat) {
      return NextResponse.json({ strategy: null, templates: [] });
    }

    const [{ data: fallbackObj }, { data: fallbackTpls }] = await Promise.all([
      supabase
        .from('kefy_content_objectives')
        .select('name_es, name_en')
        .eq('id', fallbackStrat.objective_id)
        .single(),
      supabase
        .from('kefy_strategy_templates')
        .select(
          `id, week_num, post_num, format, channel_hint,
           topic_es, copy_structure_es, goal_es,
           topic_en, copy_structure_en, goal_en, sort_order`,
        )
        .eq('strategy_id', fallbackStrat.id)
        .order('week_num', { ascending: true })
        .order('sort_order', { ascending: true }),
    ]);

    return NextResponse.json({
      strategy: fallbackStrat,
      templates: fallbackTpls ?? [],
      is_fallback: true,
      fallback_objective: {
        name_es: fallbackObj?.name_es ?? '',
        name_en: fallbackObj?.name_en ?? '',
      },
    });
  }

  const { data: templates, error: tplError } = await supabase
    .from('kefy_strategy_templates')
    .select(
      `id, week_num, post_num, format, channel_hint,
       topic_es, copy_structure_es, goal_es,
       topic_en, copy_structure_en, goal_en, sort_order`,
    )
    .eq('strategy_id', strategy.id)
    .order('week_num', { ascending: true })
    .order('sort_order', { ascending: true });

  if (tplError) {
    console.error('[api/strategies/recommend] templates error:', tplError.message);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }

  return NextResponse.json({ strategy, templates: templates ?? [] });
}
