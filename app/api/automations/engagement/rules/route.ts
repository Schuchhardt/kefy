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
    action_type: string;
    action_template: string;
    is_active?: boolean;
    condition_platform?: string | null;
    condition_keyword?: string | null;
    condition_rating?: number | null;
  };

  if (!body.name?.trim() || !body.trigger_type || !body.action_type) {
    return NextResponse.json({ error: 'name, trigger_type and action_type are required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .insert({
      org_id:            auth.orgId,
      name:              body.name.trim(),
      trigger_type:      body.trigger_type,
      action_type:       body.action_type,
      action_template:   body.action_template ?? '',
      is_active:         body.is_active ?? true,
      condition_platform: body.condition_platform ?? null,
      condition_keyword:  body.condition_keyword ?? null,
      condition_rating:   body.condition_rating ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}
