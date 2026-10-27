import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getBrandStrategy, setBrandStrategy, type BrandStrategyPatch } from '@/lib/services/strategy';

// La estrategia activa es de cada marca: estas rutas leen y guardan la de la
// marca activa (cookie). La ruta conserva el nombre /org de cuando era una
// sola por organización.

// GET /api/strategies/org
// Returns the active brand's saved strategy selection
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const { selection } = await getBrandStrategy(ctx, { withNames: false });
    const res = NextResponse.json({ selection });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies/org', auth });
  }
}

// PATCH /api/strategies/org
// Upserts the active brand's strategy selection
// Body: { objective_id, industry_id, strategy_id, custom_strategy_id?, custom_notes? }
// custom_strategy_id activa una estrategia propia (null vuelve al catálogo).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: BrandStrategyPatch;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Un cuerpo JSON que no es un objeto (null, número…) no trae ningún campo.
  const input: BrandStrategyPatch = body && typeof body === 'object' ? body : {};
  const { objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes } = input;

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const res = NextResponse.json(
      await setBrandStrategy(ctx, { objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes }),
    );
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/strategies/org', auth });
  }
}
