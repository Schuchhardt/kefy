import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/reviews ──────────────────────────────────────────────────────────
// List reviews received on connected accounts.
//
// Query params:
//   platform  — filter by platform (optional)
//   replied   — 'false' to return only unreplied reviews (default: all)
//   limit     — default 50, max 100
//   offset    — default 0

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const platform   = searchParams.get('platform');
  const repliedStr = searchParams.get('replied');
  const limit      = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100);
  const offset     = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

  const VALID_PLATFORMS = new Set(['linkedin','instagram','facebook','twitter','tiktok','threads']);

  const db = createSupabaseServer();

  let query = db
    .from('kefy_reviews')
    .select(`
      id, platform, platform_review_id,
      reviewer_id, reviewer_name, reviewer_avatar,
      rating, body, replied_at, reply_body, published_at, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url )
    `)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (platform && VALID_PLATFORMS.has(platform)) {
    query = query.eq('platform', platform);
  }
  if (repliedStr === 'false') {
    query = query.is('replied_at', null);
  }

  const { data: reviews, error } = await query;

  if (error) {
    console.error('reviews GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }

  return NextResponse.json({ reviews: reviews ?? [] });
}
