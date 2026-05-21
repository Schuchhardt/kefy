import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// GET /api/automations/engagement/packs?objective_id=...
// Returns automation packs (and their rules) for a given objective
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const objectiveId = searchParams.get('objective_id');

  const supabase = createSupabaseServer();

  let query = supabase
    .from('kefy_automation_packs')
    .select(`
      id, objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order,
      kefy_automation_pack_rules (
        id, name_es, name_en, desc_es, desc_en,
        trigger_type, trigger_config, action_type, action_config,
        ai_context, delay_minutes,
        lead_action_type, lead_action_score_delta, lead_action_stage,
        sort_order
      )
    `)
    .order('sort_order');

  if (objectiveId) {
    query = query.eq('objective_id', objectiveId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ packs: data ?? [] });
}
