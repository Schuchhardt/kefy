import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { boostPost } from '@/lib/zernio';
import type { ZernioBoostObjective } from '@/lib/zernio';

const VALID_OBJECTIVES = new Set<ZernioBoostObjective>(['reach', 'engagement', 'traffic', 'leads']);

// ─── GET /api/ads/boost ────────────────────────────────────────────────────────
// List all ad boosts for the org.
//
// Query params:
//   status  — filter by status (optional)
//   limit   — default 50, max 100
//   offset  — default 0

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

  const VALID_STATUSES = new Set(['pending','active','completed','cancelled','failed']);

  const db = createSupabaseServer();

  let query = db
    .from('kefy_ad_boosts')
    .select(`
      id, budget_cents, currency, duration_days, objective,
      targeting_json, zernio_boost_id, platform_ad_id,
      status, started_at, ended_at, created_at,
      kefy_scheduled_posts!inner (
        id, platform_post_id, status,
        kefy_content_items ( id, channel, title, body, image_url ),
        kefy_social_accounts ( id, platform, username )
      )
    `)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && VALID_STATUSES.has(status)) {
    query = query.eq('status', status);
  }

  const { data: boosts, error } = await query;

  if (error) {
    console.error('ads boost GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch boosts' }, { status: 500 });
  }

  return NextResponse.json({ boosts: boosts ?? [] });
}

// ─── POST /api/ads/boost ───────────────────────────────────────────────────────
// Create a new boost for a published post.
//
// Body:
//   scheduled_post_id  — required (must be 'published')
//   budget_cents       — required (integer, > 0)
//   currency           — default 'USD'
//   duration_days      — required (1–30)
//   objective          — 'reach' | 'engagement' | 'traffic' | 'leads'
//   targeting          — optional JSON object

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.scheduled_post_id !== 'string' || !input.scheduled_post_id) {
    return NextResponse.json({ error: 'scheduled_post_id is required' }, { status: 422 });
  }
  if (typeof input.budget_cents !== 'number' || input.budget_cents <= 0) {
    return NextResponse.json({ error: 'budget_cents must be a positive number' }, { status: 422 });
  }
  if (typeof input.duration_days !== 'number' || input.duration_days < 1 || input.duration_days > 30) {
    return NextResponse.json({ error: 'duration_days must be between 1 and 30' }, { status: 422 });
  }
  const objective = (input.objective ?? 'reach') as ZernioBoostObjective;
  if (!VALID_OBJECTIVES.has(objective)) {
    return NextResponse.json({ error: `objective must be one of: ${[...VALID_OBJECTIVES].join(', ')}` }, { status: 422 });
  }

  const db = createSupabaseServer();

  // Fetch the scheduled post — must be published and belong to this org
  const { data: post } = await db
    .from('kefy_scheduled_posts')
    .select('id, zernio_post_id, social_account_id, status, kefy_social_accounts ( id, zernio_account_id )')
    .eq('id', input.scheduled_post_id as string)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  if (post.status !== 'published') {
    return NextResponse.json({ error: 'Only published posts can be boosted' }, { status: 422 });
  }
  if (!post.zernio_post_id) {
    return NextResponse.json({ error: 'Post has no Zernio reference' }, { status: 422 });
  }

  const account = post.kefy_social_accounts as unknown as { id: string; zernio_account_id: string | null };

  if (!account?.zernio_account_id) {
    return NextResponse.json({ error: 'Social account not connected to Zernio' }, { status: 422 });
  }

  const currency     = typeof input.currency === 'string' && input.currency.length === 3
    ? input.currency.toUpperCase()
    : 'USD';
  const targeting    = typeof input.targeting === 'object' && input.targeting !== null
    ? input.targeting as Record<string, unknown>
    : {};

  // Call Zernio boost API
  let boost;
  try {
    boost = await boostPost({
      account_id:    account.zernio_account_id,
      post_id:       post.zernio_post_id,
      budget_cents:  Math.round(input.budget_cents as number),
      currency,
      duration_days: Math.round(input.duration_days as number),
      objective,
      targeting,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create boost';
    console.error('boostPost error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persist boost record
  const { data: record, error: insertError } = await db
    .from('kefy_ad_boosts')
    .insert({
      org_id:             auth.orgId,
      scheduled_post_id:  post.id,
      social_account_id:  post.social_account_id,
      budget_cents:       Math.round(input.budget_cents as number),
      currency,
      duration_days:      Math.round(input.duration_days as number),
      objective,
      targeting_json:     targeting,
      zernio_boost_id:    boost.boost_id,
      platform_ad_id:     boost.platform_ad_id ?? null,
      status:             boost.status,
      started_at:         boost.started_at ?? null,
      ended_at:           boost.ended_at ?? null,
      created_by:         auth.userId,
    })
    .select()
    .single();

  if (insertError) {
    console.error('boost insert error:', insertError.message);
    return NextResponse.json({ error: 'Failed to save boost record' }, { status: 500 });
  }

  return NextResponse.json({ boost: record }, { status: 201 });
}
