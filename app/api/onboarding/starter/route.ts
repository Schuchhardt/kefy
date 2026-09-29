import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { ONBOARDING_ROUTE, createStarterPosts } from '@/lib/services/onboarding';

export const runtime = 'nodejs';
// Lectura de la web (~10-20 s) + 3 textos en paralelo (~10 s). Las imágenes
// las pide la página después, una a una, a /api/content/image.
export const maxDuration = 90;

// ─── POST /api/onboarding/starter ─────────────────────────────────────────────
// «Pega tu web o describe tu negocio → 3 posts» (lib/services/onboarding.ts).
// Cobra con la guardia de gasto dentro del servicio: 1 crédito por leer la web
// y 1 por cada post.
//
// Body: { url?: string, description?: string, lang?: 'es' | 'en' }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Rellena el Brand Kit: lo mismo que exige PATCH /api/brand-kit.
  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const language: 'es' | 'en' = input.lang === 'en' ? 'en' : 'es';

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  try {
    const result = await createStarterPosts(serviceContext(auth, brand.id, language), {
      url: typeof input.url === 'string' ? input.url : null,
      description: typeof input.description === 'string' ? input.description : null,
    });
    const res = NextResponse.json(result, { status: 201 });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: ONBOARDING_ROUTE, auth });
  }
}
