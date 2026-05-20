import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getPostAnalytics, ZernioError } from '@/lib/zernio';

// ─── POST /api/analytics/sync ─────────────────────────────────────────────────
// Fetch latest metrics from Zernio for all published posts and upsert snapshots.
// Uses GET /v1/analytics?postId={id} — requires the Analytics add-on.
//
// Optionally target specific posts:
//   Body: { scheduled_post_ids?: string[] }  — if omitted, syncs all published posts

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let postIds: string[] | null = null;
  try {
    const body = await req.json() as { scheduled_post_ids?: unknown };
    if (Array.isArray(body.scheduled_post_ids)) {
      postIds = body.scheduled_post_ids.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // no body / not JSON — sync all
  }

  const db = createSupabaseServer();

  let query = db
    .from('kefy_scheduled_posts')
    .select('id, zernio_post_id')
    .eq('org_id', auth.orgId)
    .eq('status', 'published')
    .not('zernio_post_id', 'is', null);

  if (postIds && postIds.length > 0) {
    query = query.in('id', postIds);
  }

  const { data: posts, error: listError } = await query;

  if (listError) {
    console.error('analytics/sync list error:', listError.message);
    return NextResponse.json({ error: 'Failed to list posts' }, { status: 500 });
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, results: [] });
  }

  const now = new Date().toISOString();
  const results: Array<{ scheduled_post_id: string; status: 'synced' | 'failed'; error?: string }> = [];

  for (const post of posts) {
    try {
      const analytics = await getPostAnalytics(post.zernio_post_id!);

      const { error: insertError } = await db.from('kefy_post_metrics').insert({
        org_id:            auth.orgId,
        scheduled_post_id: post.id,
        measured_at:       now,
        impressions:       analytics.impressions ?? 0,
        reach:             analytics.reach       ?? 0,
        likes:             analytics.likes       ?? 0,
        comments:          analytics.comments    ?? 0,
        shares:            analytics.shares      ?? 0,
        clicks:            analytics.clicks      ?? 0,
        saves:             analytics.saves       ?? 0,
      });

      if (insertError) throw new Error(insertError.message);

      results.push({ scheduled_post_id: post.id, status: 'synced' });
    } catch (err) {
      // 202 = analytics sync still pending on Zernio's side — not a real failure
      const isPending = err instanceof ZernioError && err.statusCode === 202;
      const msg = isPending ? 'Analytics pending' : (err instanceof Error ? err.message : 'Unknown error');
      if (!isPending) console.warn(`Metrics sync failed for post ${post.id}:`, msg);
      results.push({ scheduled_post_id: post.id, status: 'failed', error: msg });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({ synced, failed, results }, { status: failed > 0 && synced === 0 ? 502 : 200 });
}
