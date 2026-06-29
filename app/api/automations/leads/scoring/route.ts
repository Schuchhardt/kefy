import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// GET /api/automations/leads/scoring
// Returns the org's lead scoring config (creates default if none exists)
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('kefy_lead_scoring_config')
    .select('*')
    .eq('org_id', auth.orgId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return defaults inline if no config exists yet
  const config = data ?? {
    defaults: {
      comment: 5, dm: 15, mention: 8,
      follow: 3, share: 12, click: 2, manual: 0,
    },
    thresholds: {
      tibio: 20, caliente: 50, contactado: 70, convertido: 100,
    },
  };

  return NextResponse.json({ config });
}

// PATCH /api/automations/leads/scoring
// Body: { defaults?: {...}, thresholds?: {...} }
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { defaults?: Record<string, number>; thresholds?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.defaults)   updates.defaults   = body.defaults;
  if (body.thresholds) updates.thresholds = body.thresholds;

  const { data, error } = await supabase
    .from('kefy_lead_scoring_config')
    .upsert({ org_id: auth.orgId, ...updates }, { onConflict: 'org_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data });
}
