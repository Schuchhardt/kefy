import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// POST /api/automations/engagement/rules/bulk
// Installs all rules from a pack into the org
// Body: { pack_id: string }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { pack_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pack_id } = body;
  if (!pack_id) {
    return NextResponse.json({ error: 'pack_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  // Load pack rules
  const { data: packRules, error: packError } = await supabase
    .from('kefy_automation_pack_rules')
    .select('*')
    .eq('pack_id', pack_id)
    .order('sort_order');

  if (packError) return NextResponse.json({ error: packError.message }, { status: 500 });
  if (!packRules?.length) return NextResponse.json({ error: 'Pack not found or empty' }, { status: 404 });

  // Insert all rules for this org
  const toInsert = packRules.map((pr) => ({
    org_id:                  auth.orgId,
    name:                    pr.name_es,
    trigger_type:            pr.trigger_type,
    trigger_config:          pr.trigger_config ?? {},
    conditions:              [],
    action_type:             pr.action_type,
    action_config:           pr.action_config ?? {},
    action_template:         '',
    ai_context:              pr.ai_context ?? null,
    delay_minutes:           pr.delay_minutes ?? 0,
    is_active:               true,
    created_from:            `pack:${pack_id}`,
    lead_action_type:        pr.lead_action_type ?? null,
    lead_action_score_delta: pr.lead_action_score_delta ?? 0,
    lead_action_stage:       pr.lead_action_stage ?? null,
  }));

  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .insert(toInsert)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data, inserted: data?.length ?? 0 }, { status: 201 });
}
