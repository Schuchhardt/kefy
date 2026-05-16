import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/comments ─────────────────────────────────────────────────────────
// List comments received on published posts.
//
// Query params:
//   platform  — filter by platform (optional)
//   replied   — 'false' to return only unreplied comments (default: all)
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
    .from('kefy_comments')
    .select(`
      id, platform, platform_post_id, platform_comment_id,
      author_id, author_name, author_avatar,
      body, replied_at, reply_body, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url ),
      kefy_scheduled_posts ( id, platform_post_id )
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

  const { data: comments, error } = await query;

  if (error) {
    console.error('comments GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  return NextResponse.json({ comments: comments ?? [] });
}
