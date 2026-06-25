import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { replyToComment } from '@/lib/zernio';

// ─── POST /api/comments/[commentId]/reply ─────────────────────────────────────
// Reply to a comment via Zernio and mark it as replied.
//
// Body:
//   text — reply text (required)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { commentId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.text !== 'string' || !input.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 422 });
  }

  const db = createSupabaseServer();

  // Fetch comment + its social account
  const { data: comment } = await db
    .from('kefy_comments')
    .select(`
      id, platform_comment_id, zernio_comment_id, platform_post_id, replied_at,
      kefy_social_accounts!inner ( id, zernio_account_id )
    `)
    .eq('id', commentId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  if (comment.replied_at) return NextResponse.json({ error: 'Comment already replied' }, { status: 409 });

  const account = comment.kefy_social_accounts as unknown as { id: string; zernio_account_id: string | null };

  if (!account.zernio_account_id) {
    return NextResponse.json({ error: 'Account not connected to Zernio' }, { status: 422 });
  }

  const platformCommentId = comment.zernio_comment_id ?? comment.platform_comment_id;
  const platformPostId = comment.platform_post_id;

  try {
    await replyToComment(account.zernio_account_id, platformPostId, platformCommentId, (input.text as string).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reply';
    console.error('replyToComment error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: updateError } = await db
    .from('kefy_comments')
    .update({
      replied_at: new Date().toISOString(),
      reply_body: (input.text as string).trim(),
    })
    .eq('id', commentId);

  if (updateError) {
    console.error('comment update error:', updateError.message);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
