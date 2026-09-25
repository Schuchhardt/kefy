import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { BRAND_LIMITS, slugifyBrand } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listBrands } from '@/lib/services/brands';

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
// Auto-creates an empty brand kit for the new brand.

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

  const db = createSupabaseServer();

  // Check plan limit
  const { count: existing } = await db
    .from('kefy_brands')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .eq('archived', false);

  const limit = BRAND_LIMITS[auth.plan] ?? 1;

  if ((existing ?? 0) >= limit) {
    return NextResponse.json(
      { error: `Your plan allows up to ${limit === Infinity ? 'unlimited' : limit} brand(s). Upgrade to add more.` },
      { status: 403 },
    );
  }

  // Generate unique slug
  const baseSlug = slugifyBrand(name);
  const uniqueSuffix = Math.random().toString(36).slice(2, 7);
  const slug = `${baseSlug}-${uniqueSuffix}`;

  const { data: brand, error: brandError } = await db
    .from('kefy_brands')
    .insert({ org_id: auth.orgId, name, slug })
    .select('*')
    .single();

  if (brandError || !brand) {
    console.error('brands POST error:', brandError?.message);
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }

  // Auto-create empty brand kit for new brand
  const { error: kitError } = await db
    .from('kefy_brand_kits')
    .insert({ org_id: auth.orgId, brand_id: brand.id, name });

  if (kitError) {
    console.error('brand kit auto-create error:', kitError.message);
    // Non-fatal: brand was created, kit will be auto-created on first access
  }

  return NextResponse.json({ brand }, { status: 201 });
}
