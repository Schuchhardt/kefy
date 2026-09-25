import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { replyToComment } from '@/lib/services/inbox';

// ─── POST /api/comments/[commentId]/reply ─────────────────────────────────────
// Reply to a comment via Zernio and mark it as replied.
// La lógica vive en lib/services/inbox.ts (la comparte el asistente).
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

  // Sin marca: alcance 'org', el comentario se valida por org_id.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await replyToComment(ctx, { commentId, text: input.text }));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/comments/[commentId]/reply', auth });
  }
}
