import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { listComments } from '@/lib/zernio';

// ─── POST /api/comments/sync ───────────────────────────────────────────────────
// Pulls recent comments from Zernio for every active social account in the
// current brand and upserts them into kefy_comments.
//
// Returns: { synced: number }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const db = createSupabaseServer();

  // Get all active social accounts for this brand that have a Zernio account ID
  const { data: accounts } = await db
    .from('kefy_social_accounts')
    .select('id, platform, zernio_account_id')
    .eq('brand_id', brand.id)
    .eq('status', 'active')
    .not('zernio_account_id', 'is', null);

  if (!accounts || accounts.length === 0) {
    const res = NextResponse.json({ synced: 0, message: 'No active accounts with Zernio connection' });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  }

  type CommentRow = {
    org_id:              string;
    brand_id:            string;
    social_account_id:   string;
    platform:            string;
    platform_post_id:    string;
    platform_comment_id: string;
    author_id:           string;
    author_name:         string | null;
    author_avatar:       string | null;
    body:                string;
    created_at:          string;
  };

  const rows: CommentRow[] = [];

  await Promise.allSettled(
    accounts.map(async (account) => {
      if (!account.zernio_account_id) return;
      try {
        const comments = await listComments(account.zernio_account_id);
        for (const c of comments) {
          if (!c.body?.trim()) continue;
          rows.push({
            org_id:              auth.orgId,
            brand_id:            brand.id,
            social_account_id:   account.id,
            platform:            account.platform,
            platform_post_id:    c.post_id,
            platform_comment_id: c.comment_id,
            author_id:           c.author_id,
            author_name:         c.author_name ?? null,
            author_avatar:       c.author_avatar ?? null,
            body:                c.body,
            created_at:          c.created_at,
          });
        }
      } catch (err) {
        console.error(`comments sync error for account ${account.id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );

  if (rows.length === 0) {
    const res = NextResponse.json({ synced: 0 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  }

  const { error: upsertError } = await db
    .from('kefy_comments')
    .upsert(rows, { onConflict: 'social_account_id,platform_comment_id', ignoreDuplicates: true });

  if (upsertError) {
    console.error('comments sync upsert error:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save comments' }, { status: 500 });
  }

  const res = NextResponse.json({ synced: rows.length });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
