import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { recommendContent } from '@/lib/services/recommendations';

const ROUTE = 'GET /api/content/recommend';

// GET /api/content/recommend?offset=N&lang=es|en&hint=...
// Tres ideas de contenido para la marca activa (cookie). La lógica vive en
// lib/services/recommendations.ts: con historial, la IA construye sobre lo ya
// publicado (más peso en lo último y en lo que mejor funcionó); sin historial,
// el calendario de la estrategia. `offset` rota las ideas («Otras ideas»).
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0);
  const lang: 'es' | 'en' = searchParams.get('lang') === 'en' ? 'en' : 'es';
  const hint = (searchParams.get('hint') ?? '').trim().slice(0, 500);

  const { brand } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  try {
    const ctx = serviceContext(auth, brand.id, lang, { brandScope: 'strict', source: 'route' });
    return NextResponse.json(await recommendContent(ctx, { offset, hint }));
  } catch (err) {
    return serviceErrorResponse(err, { route: ROUTE, auth });
  }
}
