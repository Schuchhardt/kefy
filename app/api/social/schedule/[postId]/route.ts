import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { cancelScheduledPost } from '@/lib/services/publish';

// ─── DELETE /api/social/schedule/[postId] ─────────────────────────────────────
// Cancel a scheduled post.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  // Ruta de toda la organización (brandScope 'org'), como antes.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    await cancelScheduledPost(ctx, postId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serviceErrorResponse(err, { route: '/api/social/schedule/[postId]', auth });
  }
}
