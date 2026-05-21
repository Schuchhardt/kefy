import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// PATCH /api/automations/leads/[id]
// Allowed: stage, score, notes, tags, contacted, contacted_at, converted, converted_at, display_name, avatar_url
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const supabase = createSupabaseServer();

  // Verify ownership
  const { data: existing } = await supabase
    .from('kefy_leads')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const allowed = [
    'stage', 'score', 'notes', 'tags',
    'contacted', 'contacted_at',
    'converted', 'converted_at',
    'display_name', 'avatar_url',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Auto-set timestamps
  if (body.contacted === true && !body.contacted_at) {
    updates.contacted_at = new Date().toISOString();
  }
  if (body.converted === true && !body.converted_at) {
    updates.converted_at = new Date().toISOString();
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('kefy_leads')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ lead: data });
}

// DELETE /api/automations/leads/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createSupabaseServer();

  const { error } = await supabase
    .from('kefy_leads')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
