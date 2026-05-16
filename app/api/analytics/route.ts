import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/analytics ───────────────────────────────────────────────────────
// Dashboard overview: totals, per-platform breakdown, top 5 posts.
//
// Query params:
//   from  — ISO date string (default: 30 days ago)
//   to    — ISO date string (default: now)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const to   = searchParams.get('to')   ?? new Date().toISOString();
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const db = createSupabaseServer();

  // Latest metric snapshot per post (use a subquery via RPC-less approach)
  // We pull all metrics for the org in the date range, then aggregate in JS
  // (Supabase JS client doesn't support window functions directly)
  const { data: metrics, error } = await db
    .from('kefy_post_metrics')
    .select(`
      id,
      scheduled_post_id,
      measured_at,
      impressions,
      reach,
      likes,
      comments,
      shares,
      clicks,
      saves,
      engagement_rate,
      kefy_scheduled_posts!inner (
        id,
        status,
        kefy_social_accounts!inner ( id, platform ),
        kefy_content_items!inner ( id, channel, body )
      )
    `)
    .eq('org_id', auth.orgId)
    .gte('measured_at', from)
    .lte('measured_at', to)
    .order('measured_at', { ascending: false });

  if (error) {
    console.error('analytics fetch error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }

  // Keep only the latest snapshot per post
  const latestByPost = new Map<string, typeof metrics[number]>();
  for (const row of metrics ?? []) {
    if (!latestByPost.has(row.scheduled_post_id)) {
      latestByPost.set(row.scheduled_post_id, row);
    }
  }

  const rows = Array.from(latestByPost.values());

  // Aggregate totals
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      reach:       acc.reach       + r.reach,
      likes:       acc.likes       + r.likes,
      comments:    acc.comments    + r.comments,
      shares:      acc.shares      + r.shares,
      clicks:      acc.clicks      + r.clicks,
      saves:       acc.saves       + r.saves,
      posts:       acc.posts       + 1,
    }),
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0, saves: 0, posts: 0 },
  );

  const avgEngagement =
    totals.posts > 0
      ? rows.reduce((sum, r) => sum + Number(r.engagement_rate ?? 0), 0) / totals.posts
      : 0;

  // Per-platform breakdown
  const byPlatform: Record<string, { posts: number; impressions: number; engagement_rate: number }> = {};
  for (const r of rows) {
    type PostRowP = { kefy_social_accounts: { platform: string } | { platform: string }[] | null };
    const postRow = (Array.isArray(r.kefy_scheduled_posts) ? r.kefy_scheduled_posts[0] : r.kefy_scheduled_posts) as PostRowP | null;
    const acct = Array.isArray(postRow?.kefy_social_accounts) ? postRow?.kefy_social_accounts[0] : postRow?.kefy_social_accounts;
    const platform = acct?.platform ?? 'unknown';
    if (!byPlatform[platform]) byPlatform[platform] = { posts: 0, impressions: 0, engagement_rate: 0 };
    byPlatform[platform].posts        += 1;
    byPlatform[platform].impressions  += r.impressions;
    byPlatform[platform].engagement_rate += Number(r.engagement_rate ?? 0);
  }
  for (const p of Object.values(byPlatform)) {
    p.engagement_rate = p.posts > 0 ? p.engagement_rate / p.posts : 0;
  }

  // Top 5 posts by engagement rate
  const top5 = [...rows]
    .sort((a, b) => Number(b.engagement_rate ?? 0) - Number(a.engagement_rate ?? 0))
    .slice(0, 5)
    .map((r) => {
      type PostRow = { id: string; kefy_social_accounts: { platform: string } | { platform: string }[] | null; kefy_content_items: Array<{ id: string; channel: string; body: string }> | null };
      const post = (Array.isArray(r.kefy_scheduled_posts) ? r.kefy_scheduled_posts[0] : r.kefy_scheduled_posts) as PostRow | null;
      const postAcct = Array.isArray(post?.kefy_social_accounts) ? post?.kefy_social_accounts?.[0] : post?.kefy_social_accounts;
      const content = Array.isArray(post?.kefy_content_items) ? post!.kefy_content_items[0] : null;
      return {
        scheduled_post_id: r.scheduled_post_id,
        platform:          postAcct?.platform ?? 'unknown',
        content_id:        content?.id ?? null,
        body_preview:      (content?.body ?? '').slice(0, 80),
        impressions:       r.impressions,
        engagement_rate:   Number(r.engagement_rate ?? 0),
        likes:             r.likes,
        comments:          r.comments,
        shares:            r.shares,
      };
    });

  return NextResponse.json({
    period: { from, to },
    totals: { ...totals, avg_engagement_rate: Number(avgEngagement.toFixed(4)) },
    by_platform: byPlatform,
    top_posts: top5,
  });
}
