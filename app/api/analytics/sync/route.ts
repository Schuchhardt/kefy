import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── POST /api/analytics/sync ─────────────────────────────────────────────────
// Fetch latest metrics from Zernio for all published posts and upsert snapshots.
//
// Optionally target specific posts:
//   Body: { scheduled_post_ids?: string[] }  — if omitted, syncs all published posts

interface ZernioMetrics {
  impressions: number;
  reach:       number;
  likes:       number;
  comments:    number;
  shares:      number;
  clicks:      number;
  saves:       number;
}

async function fetchZernioMetrics(zernioPostId: string): Promise<ZernioMetrics> {
  const baseUrl = process.env.ZERNIO_API_URL ?? 'https://api.zernio.com/v1';
  const apiKey  = process.env.ZERNIO_API_KEY;

  if (!apiKey) throw new Error('ZERNIO_API_KEY is not configured');

  const res = await fetch(`${baseUrl}/posts/${encodeURIComponent(zernioPostId)}/metrics`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zernio metrics error ${res.status}: ${text}`);
  }

  return res.json() as Promise<ZernioMetrics>;
}

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
      const metrics = await fetchZernioMetrics(post.zernio_post_id!);

      const { error: insertError } = await db.from('kefy_post_metrics').insert({
        org_id:            auth.orgId,
        scheduled_post_id: post.id,
        measured_at:       now,
        impressions:       metrics.impressions ?? 0,
        reach:             metrics.reach       ?? 0,
        likes:             metrics.likes       ?? 0,
        comments:          metrics.comments    ?? 0,
        shares:            metrics.shares      ?? 0,
        clicks:            metrics.clicks      ?? 0,
        saves:             metrics.saves       ?? 0,
      });

      if (insertError) throw new Error(insertError.message);

      results.push({ scheduled_post_id: post.id, status: 'synced' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`Metrics sync failed for post ${post.id}:`, msg);
      results.push({ scheduled_post_id: post.id, status: 'failed', error: msg });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({ synced, failed, results }, { status: failed > 0 && synced === 0 ? 502 : 200 });
}
