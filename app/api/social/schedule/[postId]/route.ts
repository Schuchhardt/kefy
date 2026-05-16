import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── DELETE /api/social/schedule/[postId] ─────────────────────────────────────
// Cancel a scheduled post.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;
  const db = createSupabaseServer();

  const { data: post, error: fetchError } = await db
    .from('kefy_scheduled_posts')
    .select('id, zernio_post_id, status, content_item_id, org_id')
    .eq('id', postId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (fetchError) {
    console.error('schedule fetch error:', fetchError.message);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
  if (!post) return NextResponse.json({ error: 'Scheduled post not found' }, { status: 404 });

  if (post.status === 'published') {
    return NextResponse.json({ error: 'Cannot cancel an already published post' }, { status: 409 });
  }
  if (post.status === 'cancelled') {
    return NextResponse.json({ error: 'Post is already cancelled' }, { status: 409 });
  }

  // Cancel on Zernio (best-effort)
  if (post.zernio_post_id) {
    try {
      const { cancelPost } = await import('@/lib/zernio');
      await cancelPost(post.zernio_post_id);
    } catch (err) {
      console.warn('Zernio cancel warning:', err instanceof Error ? err.message : err);
    }
  }

  await db
    .from('kefy_scheduled_posts')
    .update({ status: 'cancelled' })
    .eq('id', post.id);

  // Revert content item to approved if it was only scheduled via this post
  const { count } = await db
    .from('kefy_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', post.content_item_id)
    .eq('status', 'scheduled');

  if ((count ?? 0) === 0) {
    await db
      .from('kefy_content_items')
      .update({ status: 'approved' })
      .eq('id', post.content_item_id);
  }

  return new NextResponse(null, { status: 204 });
}
