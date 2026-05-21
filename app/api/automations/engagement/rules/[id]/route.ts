import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

async function getRule(supabase: ReturnType<typeof createSupabaseServer>, id: string, orgId: string) {
  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createSupabaseServer();

  const rule = await getRule(supabase, id, auth.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;

  const allowed = ['name','trigger_type','action_type','action_template',
    'is_active','condition_platform','condition_keyword','condition_rating'] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('kefy_engagement_rules')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createSupabaseServer();

  const rule = await getRule(supabase, id, auth.orgId);
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('kefy_engagement_rules')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
