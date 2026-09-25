import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { syncComments } from '@/lib/services/inbox';

// ─── POST /api/comments/sync ───────────────────────────────────────────────────
// Pulls recent comments from Zernio for every active social account in the
// current brand and upserts them into kefy_comments.
// La lógica vive en lib/services/inbox.ts (la comparte el asistente).
//
// Returns: { synced: number }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const res = NextResponse.json(await syncComments(ctx));
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/comments/sync', auth });
  }
}
