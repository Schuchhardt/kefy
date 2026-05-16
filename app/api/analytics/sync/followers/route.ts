import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getAccountMetrics } from '@/lib/zernio';

// ─── POST /api/analytics/sync/followers ───────────────────────────────────────
// Fetch latest follower counts from Zernio for all active social accounts
// of the org and upsert snapshots into kefy_follower_snapshots.
//
// Optionally target specific accounts:
//   Body: { social_account_ids?: string[] }  — if omitted, syncs all active accounts

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let targetIds: string[] | null = null;
  try {
    const body = await req.json() as { social_account_ids?: unknown };
    if (Array.isArray(body.social_account_ids)) {
      targetIds = (body.social_account_ids as unknown[]).filter(
        (id): id is string => typeof id === 'string',
      );
    }
  } catch { /* body optional */ }

  const db = createSupabaseServer();

  let query = db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, platform, username')
    .eq('org_id', auth.orgId)
    .eq('status', 'active');

  if (targetIds?.length) {
    query = query.in('id', targetIds);
  }

  const { data: accounts, error: accountsError } = await query;

  if (accountsError) {
    console.error('followers sync accounts error:', accountsError.message);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ synced: 0, results: [] });
  }

  const now = new Date().toISOString();
  type SyncResult = { account_id: string; platform: string; status: 'ok' | 'error'; followers?: number; error?: string };
  const results: SyncResult[] = [];

  for (const account of accounts) {
    if (!account.zernio_account_id) {
      results.push({ account_id: account.id, platform: account.platform, status: 'error', error: 'No zernio_account_id' });
      continue;
    }

    try {
      const metrics = await getAccountMetrics(account.zernio_account_id);

      await db.from('kefy_follower_snapshots').insert({
        org_id:            auth.orgId,
        social_account_id: account.id,
        followers_count:   metrics.followers_count,
        following_count:   metrics.following_count,
        posts_count:       metrics.posts_count,
        measured_at:       now,
      });

      results.push({
        account_id: account.id,
        platform:   account.platform,
        status:     'ok',
        followers:  metrics.followers_count,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`followers sync error for account ${account.id}:`, msg);
      results.push({ account_id: account.id, platform: account.platform, status: 'error', error: msg });
    }
  }

  const synced = results.filter((r) => r.status === 'ok').length;

  return NextResponse.json({ synced, results });
}
