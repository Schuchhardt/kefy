import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/analytics/posts ─────────────────────────────────────────────────
// Per-post metrics list with latest snapshot.
//
// Query params:
//   platform  — filter by platform
//   from      — ISO date string (default: 30 days ago)
//   to        — ISO date string (default: now)
//   page      — 1-based (default: 1)
//   limit     — max 100 (default: 20)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const to       = searchParams.get('to')       ?? new Date().toISOString();
  const from     = searchParams.get('from')     ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const platform = searchParams.get('platform') ?? null;
  const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10));
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  const db = createSupabaseServer();

  // Build query — filter published posts with metrics
  let postsQuery = db
    .from('kefy_scheduled_posts')
    .select(`
      id,
      platform,
      published_at,
      zernio_post_id,
      kefy_content_items!inner ( id, channel, body, image_url ),
      kefy_post_metrics ( id, measured_at, impressions, reach, likes, comments, shares, clicks, saves, engagement_rate )
    `)
    .eq('org_id', auth.orgId)
    .eq('status', 'published')
    .gte('published_at', from)
    .lte('published_at', to)
    .order('published_at', { ascending: false });

  if (platform) postsQuery = postsQuery.eq('platform', platform);

  const offset = (page - 1) * limit;
  postsQuery = postsQuery.range(offset, offset + limit - 1);

  const { data: posts, error, count } = await postsQuery;

  if (error) {
    console.error('analytics/posts fetch error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch post analytics' }, { status: 500 });
  }

  type MetricRow = {
    id: string;
    measured_at: string;
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    saves: number;
    engagement_rate: string | number | null;
  };

  const items = (posts ?? []).map((post) => {
    const snapshots: MetricRow[] = Array.isArray(post.kefy_post_metrics)
      ? (post.kefy_post_metrics as MetricRow[])
      : [];

    const latest = snapshots.sort(
      (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
    )[0] ?? null;

    const content = (Array.isArray(post.kefy_content_items)
      ? post.kefy_content_items[0]
      : post.kefy_content_items) as { id: string; channel: string; body: string; image_url: string | null } | null;

    return {
      scheduled_post_id: post.id,
      platform:          post.platform,
      published_at:      post.published_at,
      zernio_post_id:    post.zernio_post_id,
      content: {
        id:          content?.id ?? null,
        channel:     content?.channel ?? null,
        body_preview: (content?.body ?? '').slice(0, 120),
        has_image:   Boolean(content?.image_url),
      },
      latest_metrics: latest
        ? {
            measured_at:     latest.measured_at,
            impressions:     latest.impressions,
            reach:           latest.reach,
            likes:           latest.likes,
            comments:        latest.comments,
            shares:          latest.shares,
            clicks:          latest.clicks,
            saves:           latest.saves,
            engagement_rate: Number(latest.engagement_rate ?? 0),
          }
        : null,
      snapshots_count: snapshots.length,
    };
  });

  return NextResponse.json({
    data:  items,
    total: count ?? items.length,
    page,
    limit,
  });
}
