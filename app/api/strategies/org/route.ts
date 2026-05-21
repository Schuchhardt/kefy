import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// GET /api/strategies/org
// Returns the current org's saved strategy selection
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('kefy_org_strategies')
    .select(
      `id, org_id, objective_id, industry_id, strategy_id, custom_notes, updated_at`,
    )
    .eq('org_id', auth.orgId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = "no rows found" — that is expected for new orgs
    console.error('[api/strategies/org] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to load strategy selection' }, { status: 500 });
  }

  return NextResponse.json({ selection: data ?? null });
}

// PATCH /api/strategies/org
// Upserts the org's strategy selection
// Body: { objective_id, industry_id, strategy_id, custom_notes? }
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    objective_id?: string;
    industry_id?: string;
    strategy_id?: string;
    custom_notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { objective_id, industry_id, strategy_id, custom_notes } = body;

  if (!objective_id && !industry_id && !strategy_id && custom_notes === undefined) {
    return NextResponse.json(
      { error: 'At least one field is required' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  // Fetch existing selection to merge (partial update support)
  const { data: existing } = await supabase
    .from('kefy_org_strategies')
    .select('objective_id, industry_id, strategy_id, custom_notes')
    .eq('org_id', auth.orgId)
    .single();

  const merged = {
    org_id:       auth.orgId,
    objective_id: objective_id  ?? existing?.objective_id  ?? null,
    industry_id:  industry_id   ?? existing?.industry_id   ?? null,
    strategy_id:  strategy_id   !== undefined ? (strategy_id ?? null)   : (existing?.strategy_id  ?? null),
    custom_notes: custom_notes  !== undefined ? (custom_notes ?? null)  : (existing?.custom_notes ?? null),
    updated_at:   new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('kefy_org_strategies')
    .upsert(merged, { onConflict: 'org_id' })
    .select('id, org_id, objective_id, industry_id, strategy_id, custom_notes, updated_at')
    .single();

  if (error) {
    console.error('[api/strategies/org] PATCH error:', error.message);
    return NextResponse.json({ error: 'Failed to save strategy selection' }, { status: 500 });
  }

  return NextResponse.json({ selection: data });
}
