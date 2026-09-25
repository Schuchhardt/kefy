import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { syncPostMetrics } from '@/lib/services/analytics';

// ─── POST /api/analytics/sync ─────────────────────────────────────────────────
// Fetch latest metrics from Zernio for all published posts and upsert snapshots.
// Uses GET /v1/analytics?postId={id} — requires the Analytics add-on.
// La lógica vive en lib/services/analytics.ts (la comparte el asistente).
//
// Optionally target specific posts:
//   Body: { scheduled_post_ids?: string[] }  — if omitted, syncs all published posts

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let postIds: string[] | null = null;
  try {
    const body = await req.json() as { scheduled_post_ids?: unknown };
    if (Array.isArray(body.scheduled_post_ids)) {
      postIds = body.scheduled_post_ids.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // no body / not JSON — sync all
  }

  // Alcance 'org': toda la organización, sin marca (como siempre).
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    const { status, body } = await syncPostMetrics(ctx, { ids: postIds });
    return NextResponse.json(body, { status });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/analytics/sync', auth });
  }
}
