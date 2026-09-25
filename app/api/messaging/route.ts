import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listThreads } from '@/lib/services/inbox';

// ─── GET /api/messaging ────────────────────────────────────────────────────────
// Returns the latest inbound message per thread for the brand (unified inbox).
// La lógica vive en lib/services/inbox.ts (la comparte el asistente).
//
// Query params:
//   platform  — filter by platform (optional)
//   unread    — 'true' to return only unread threads
//   limit     — default 50, max 100
//   offset    — default 0

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const out = await listThreads(ctx, {
      platform:   searchParams.get('platform'),
      unreadOnly: searchParams.get('unread') === 'true',
      limit:      Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100),
      offset:     Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0),
    });
    const res = NextResponse.json(out);
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/messaging', auth });
  }
}
