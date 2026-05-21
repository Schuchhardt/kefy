import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// GET /api/automations/leads
// Query params: stage?, channel?, search?, limit?, offset?
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage   = searchParams.get('stage');
  const channel = searchParams.get('channel');
  const search  = searchParams.get('search');
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200);
  const offset  = parseInt(searchParams.get('offset') ?? '0', 10);

  const supabase = createSupabaseServer();

  let query = supabase
    .from('kefy_leads')
    .select('*', { count: 'exact' })
    .eq('org_id', auth.orgId)
    .order('last_interaction_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (stage)   query = query.eq('stage', stage);
  if (channel) query = query.eq('channel', channel);
  if (search)  query = query.ilike('username', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data ?? [], total: count ?? 0 });
}

// POST /api/automations/leads
// Body: { username, channel, display_name?, avatar_url?, stage?, score?, notes?, tags? }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    username:      string;
    channel:       string;
    display_name?: string;
    avatar_url?:   string;
    stage?:        string;
    score?:        number;
    notes?:        string;
    tags?:         string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.username?.trim() || !body.channel?.trim()) {
    return NextResponse.json({ error: 'username and channel are required' }, { status: 400 });
  }

  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from('kefy_leads')
    .upsert({
      org_id:       auth.orgId,
      username:     body.username.trim(),
      channel:      body.channel.trim(),
      display_name: body.display_name ?? null,
      avatar_url:   body.avatar_url   ?? null,
      stage:        body.stage        ?? 'frio',
      score:        body.score        ?? 0,
      notes:        body.notes        ?? null,
      tags:         body.tags         ?? [],
      last_interaction_at: new Date().toISOString(),
    }, { onConflict: 'org_id,channel,username' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ lead: data }, { status: 201 });
}
