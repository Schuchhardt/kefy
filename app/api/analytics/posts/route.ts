import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listPostPerformance } from '@/lib/services/analytics';

// ─── GET /api/analytics/posts ─────────────────────────────────────────────────
// Per-post metrics list with latest snapshot.
// La lógica vive en lib/services/analytics.ts (la comparte el asistente).
//
// Query params:
//   platform  — filter by platform
//   from      — ISO date string (default: 30 days ago)
//   to        — ISO date string (default: now)
//   page      — 1-based (default: 1)
//   limit     — max 100 (default: 20)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

  // Alcance 'org': toda la organización, sin marca (como siempre).
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await listPostPerformance(ctx, {
      from:     searchParams.get('from'),
      to:       searchParams.get('to'),
      platform: searchParams.get('platform'),
      sort:     'published_at',
      page,
      limit,
      scope:    'org',
    });
    return NextResponse.json(out);
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/analytics/posts', auth });
  }
}
