import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getAnalyticsOverview } from '@/lib/services/analytics';

// ─── GET /api/analytics ───────────────────────────────────────────────────────
// Dashboard overview: totals, per-platform breakdown, top 5 posts.
// La lógica vive en lib/services/analytics.ts (la comparte el asistente).
//
// Query params:
//   from  — ISO date string (default: 30 days ago)
//   to    — ISO date string (default: now)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;

  // Alcance 'org': toda la organización, sin marca (como siempre).
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await getAnalyticsOverview(ctx, {
      from: searchParams.get('from'),
      to:   searchParams.get('to'),
      scope: 'org',
    });
    return NextResponse.json(out);
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/analytics', auth });
  }
}
