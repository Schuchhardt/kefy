import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listEngagementPacks } from '@/lib/services/engagement';

// GET /api/automations/engagement/packs?objective_id=...
// Packs de reglas de un objetivo, solo con las reglas que se ejecutan. La
// lógica vive en lib/services/engagement.ts.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const objectiveId = new URL(req.url).searchParams.get('objective_id');
    const res = NextResponse.json({ packs: await listEngagementPacks(ctx, objectiveId) });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/automations/engagement/packs', auth });
  }
}
