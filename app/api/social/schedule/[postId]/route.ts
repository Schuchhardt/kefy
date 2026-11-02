import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { requireActiveSubscription } from '@/lib/subscription';
import { checkRateLimit, publishRule, rateLimitResponse } from '@/lib/rate-limit';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { cancelScheduledPost, rescheduleScheduledPost } from '@/lib/services/publish';

// ─── PATCH /api/social/schedule/[postId] ──────────────────────────────────────
// Cambia la fecha de una publicación programada. Body: { scheduled_at } (ISO
// 8601, futura). Para cambiar el texto o el media se edita el contenido
// (PATCH /api/content/[itemId]): sus publicaciones programadas lo reciben.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reprogramar es «programar»: igual que POST /api/social/schedule.
  const blocked = await requireActiveSubscription(auth.orgId);
  if (blocked) return blocked;

  const limit = await checkRateLimit(publishRule(auth.orgId));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiadas publicaciones en poco tiempo. Espera un momento.');
  }

  const { postId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const scheduledAt = (body as { scheduled_at?: unknown } | null)?.scheduled_at;
  if (typeof scheduledAt !== 'string' || !scheduledAt) {
    return NextResponse.json({ error: 'scheduled_at is required (ISO 8601)' }, { status: 422 });
  }

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json(await rescheduleScheduledPost(ctx, postId, { scheduledAt }));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/social/schedule/[postId]', auth });
  }
}

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
