import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { buildBrandKitUpdate, getOrCreateBrandKit, updateBrandKit } from '@/lib/services/brand-kit';

// ─── GET /api/brand-kit ───────────────────────────────────────────────────────
// Returns the brand kit for the active brand.
// Creates a default kit if one doesn't exist yet.

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
    const { kit, created } = await getOrCreateBrandKit(ctx, { brandName: brand.name });
    const res = NextResponse.json({ kit }, { status: created ? 201 : 200 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/brand-kit', auth });
  }
}

// ─── PATCH /api/brand-kit ─────────────────────────────────────────────────────
// Update the org's brand kit. Creates one if it doesn't exist yet.

export async function PATCH(req: NextRequest) {
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

  const input = body as Record<string, unknown>;
  const syncOrgName = req.nextUrl.searchParams.get('syncOrg') === '1';

  // La validación va antes de resolver la marca, como siempre: un cuerpo
  // inválido responde 422 aunque la organización no tenga marca.
  try {
    buildBrandKitUpdate(input);
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/brand-kit', auth });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const { kit } = await updateBrandKit(ctx, input, { syncOrg: syncOrgName, brandName: brand.name });
    const res = NextResponse.json({ kit });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/brand-kit', auth });
  }
}
