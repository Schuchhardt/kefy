import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { replyToReview } from '@/lib/zernio';

// ─── POST /api/reviews/[reviewId]/reply ───────────────────────────────────────
// Reply to a review via Zernio and mark it as replied.
//
// Body:
//   text — reply text (required)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reviewId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.text !== 'string' || !input.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 422 });
  }

  const db = createSupabaseServer();

  const { data: review } = await db
    .from('kefy_reviews')
    .select(`
      id, platform_review_id, zernio_review_id, replied_at,
      kefy_social_accounts!inner ( id, zernio_account_id )
    `)
    .eq('id', reviewId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  if (review.replied_at) return NextResponse.json({ error: 'Review already replied' }, { status: 409 });

  const account = review.kefy_social_accounts as unknown as { id: string; zernio_account_id: string | null };

  if (!account.zernio_account_id) {
    return NextResponse.json({ error: 'Account not connected to Zernio' }, { status: 422 });
  }

  const replyId = review.zernio_review_id ?? review.platform_review_id;

  try {
    await replyToReview(account.zernio_account_id, replyId, (input.text as string).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reply';
    console.error('replyToReview error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const { error: updateError } = await db
    .from('kefy_reviews')
    .update({
      replied_at: new Date().toISOString(),
      reply_body: (input.text as string).trim(),
    })
    .eq('id', reviewId);

  if (updateError) {
    console.error('review update error:', updateError.message);
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
