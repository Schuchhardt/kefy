import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/analytics/followers ─────────────────────────────────────────────
// Returns the latest follower snapshot per social account for the org.
// Optionally returns historical data for a date range.
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

  const { data: snapshots, error } = await db
    .from('kefy_follower_snapshots')
    .select(`
      id,
      social_account_id,
      followers_count,
      following_count,
      posts_count,
      measured_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url )
    `)
    .eq('org_id', auth.orgId)
    .gte('measured_at', from)
    .lte('measured_at', to)
    .order('measured_at', { ascending: true });

  if (error) {
    console.error('followers GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch follower data' }, { status: 500 });
  }

  // Group by social_account_id for the chart
  const byAccount: Record<string, {
    account: { id: string; platform: string; username: string; avatar_url: string | null };
    snapshots: { measured_at: string; followers_count: number }[];
    latest_followers: number;
    latest_following: number;
  }> = {};

  for (const row of snapshots ?? []) {
    const acc = row.kefy_social_accounts as unknown as { id: string; platform: string; username: string; avatar_url: string | null };
    if (!byAccount[row.social_account_id]) {
      byAccount[row.social_account_id] = {
        account: acc,
        snapshots: [],
        latest_followers: 0,
        latest_following: 0,
      };
    }
    byAccount[row.social_account_id].snapshots.push({
      measured_at: row.measured_at,
      followers_count: row.followers_count,
    });
    // Since ordered ascending, last item is the latest
    byAccount[row.social_account_id].latest_followers = row.followers_count;
    byAccount[row.social_account_id].latest_following = row.following_count;
  }

  return NextResponse.json({
    accounts: Object.values(byAccount),
    from,
    to,
  });
}
