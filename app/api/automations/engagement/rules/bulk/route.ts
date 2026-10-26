import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { installEngagementPack } from '@/lib/services/engagement';

// POST /api/automations/engagement/rules/bulk
// Instala las reglas de un pack en la marca activa.
// Body: { pack_id: string, lang?: 'es' | 'en' } — lang elige el nombre de las reglas.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { pack_id?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.pack_id !== 'string' || !body.pack_id) {
    return NextResponse.json({ error: 'pack_id is required' }, { status: 400 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const lang = body.lang === 'en' ? 'en' : 'es';
  const ctx = serviceContext(auth, brand.id, lang, { brandScope: 'org', source: 'route' });
  try {
    const out = await installEngagementPack(ctx, body.pack_id);
    const res = NextResponse.json(out, { status: out.inserted > 0 ? 201 : 200 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/automations/engagement/rules/bulk', auth });
  }
}
