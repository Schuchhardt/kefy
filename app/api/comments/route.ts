import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

// ─── GET /api/comments ─────────────────────────────────────────────────────────
// List comments received on published posts.
//
// Query params:
//   platform  — filter by platform (optional)
//   limit     — default 50, max 100
//   offset    — default 0
//
// All filtering (unanswered, own-account) happens on the client after grouping
// comments into post-level conversation threads.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform');
  const limit    = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100);
  const offset   = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

  const VALID_PLATFORMS = new Set(['linkedin','instagram','facebook','twitter','tiktok','threads']);

  const db = createSupabaseServer();

  let query = db
    .from('kefy_comments')
    .select(`
      id, platform, platform_post_id, platform_comment_id,
      author_id, author_name, author_avatar,
      body, replied_at, reply_body, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url ),
      kefy_scheduled_posts ( id, platform_post_id )
    `)
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (platform && VALID_PLATFORMS.has(platform)) {
    query = query.eq('platform', platform);
  }

  const { data: comments, error } = await query;

  if (error) {
    console.error('comments GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  const res = NextResponse.json({ comments: comments ?? [] });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
