import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { storeWebLogos, type WebLogo } from '@/lib/services/brand-enrich';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── POST /api/brand-kit/assets/import ────────────────────────────────────────
// Guarda en la biblioteca los logos que devolvió POST /api/brand-kit/enrich-url,
// cuando la persona aplica lo leído de la web. Sin créditos: solo descarga.
// Body: { website_url: string, logo_url?: string, logos: WebLogo[] }
// Returns: { logo_url: string | null, imported: number }
//   logo_url — la copia en Kefy del logo principal (o null si no se pudo traer).

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { website_url?: unknown; logo_url?: unknown; logos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body?.website_url !== 'string' || !Array.isArray(body.logos)) {
    return NextResponse.json({ error: 'website_url and logos are required' }, { status: 400 });
  }
  const logos: WebLogo[] = body.logos
    .filter((l): l is WebLogo => !!l && typeof (l as WebLogo).url === 'string')
    .map((l) => ({ url: l.url, kind: l.kind === 'icon' ? 'icon' : 'logo' }));
  const logoUrl = typeof body.logo_url === 'string' ? body.logo_url : undefined;

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  try {
    const ctx = serviceContext(auth, brand.id, 'es', { source: 'route' });
    const { extracted, imported } = await storeWebLogos(ctx, {
      url: body.website_url, extracted: { logo_url: logoUrl }, logos,
    });
    const stored = extracted.logo_url && extracted.logo_url !== logoUrl ? extracted.logo_url : null;
    const res = NextResponse.json({ logo_url: stored, imported });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/brand-kit/assets/import', auth });
  }
}
