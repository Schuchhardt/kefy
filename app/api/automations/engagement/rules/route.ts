import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name: string;
    trigger_type: string;
    trigger_config?: Record<string, unknown>;
    conditions?: unknown[];
    action_type: string;
    action_config?: Record<string, unknown>;
    action_template?: string;
    ai_context?: string | null;
    delay_minutes?: number;
    is_active?: boolean;
    condition_platform?: string | null;
    condition_keyword?: string | null;
    condition_rating?: number | null;
    lead_action_type?: string | null;
    lead_action_score_delta?: number;
    lead_action_stage?: string | null;
  };

  if (!body.name?.trim() || !body.trigger_type || !body.action_type) {
    return NextResponse.json({ error: 'name, trigger_type and action_type are required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .insert({
      org_id:                  auth.orgId,
      name:                    body.name.trim(),
      trigger_type:            body.trigger_type,
      trigger_config:          body.trigger_config          ?? {},
      conditions:              body.conditions              ?? [],
      action_type:             body.action_type,
      action_config:           body.action_config           ?? {},
      action_template:         body.action_template         ?? '',
      ai_context:              body.ai_context              ?? null,
      delay_minutes:           body.delay_minutes           ?? 0,
      is_active:               body.is_active               ?? true,
      condition_platform:      body.condition_platform      ?? null,
      condition_keyword:       body.condition_keyword       ?? null,
      condition_rating:        body.condition_rating        ?? null,
      lead_action_type:        body.lead_action_type        ?? null,
      lead_action_score_delta: body.lead_action_score_delta ?? 0,
      lead_action_stage:       body.lead_action_stage       ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}
