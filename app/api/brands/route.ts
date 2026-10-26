import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { createBrand, listBrands } from '@/lib/services/brands';

// ─── GET /api/brands ──────────────────────────────────────────────────────────
// List all non-archived brands for the auth'd org.
// Returns brands + current count so the client knows if the plan limit is reached.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // El listado es de toda la organización: no hace falta resolver la marca
  // activa (ni tocar su cookie) para construir el contexto.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json(await listBrands(ctx));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/brands', auth });
  }
}

// ─── POST /api/brands ─────────────────────────────────────────────────────────
// Create a new brand for the org. Validates plan limits.
// Auto-creates an empty brand kit for the new brand (createBrand).

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : '';

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 });
  }

  const ctx = serviceContext(auth, '', 'en', { brandScope: 'org', source: 'route' });
  try {
    const { brand } = await createBrand(ctx, { name });
    return NextResponse.json({ brand }, { status: 201 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/brands', auth });
  }
}
