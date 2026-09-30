import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { ENRICH_ROUTE, enrichBrandFromUrl } from '@/lib/services/brand-enrich';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/brand-kit/enrich-url
// Body: { url: string, lang?: string }
// Returns: { extracted: Partial<BrandKit> }
//
// La lógica vive en lib/services/brand-enrich.ts (la comparten el onboarding y
// el asistente). Cuesta 1 crédito: antes no pasaba por ninguna guardia.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url, lang } = body as { url?: unknown; lang?: unknown };
  const language: 'es' | 'en' = lang === 'en' ? 'en' : 'es';

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  try {
    const { extracted } = await enrichBrandFromUrl(serviceContext(auth, brand.id, language), { url });
    const res = NextResponse.json({ extracted });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: ENRICH_ROUTE, auth });
  }
}
