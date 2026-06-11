import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { validateBrandKitUpdate, type BrandKitUpdateInput } from '@/lib/brand-kit';
import { getBrandFromRequest } from '@/lib/brands';

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

  const db = createSupabaseServer();

  const { data: kit, error } = await db
    .from('kefy_brand_kits')
    .select('*')
    .eq('brand_id', brand.id)
    .maybeSingle();

  if (error) {
    console.error('brand-kit GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch brand kit' }, { status: 500 });
  }

  // Auto-create a default kit on first access
  if (!kit) {
    const { data: newKit, error: createError } = await db
      .from('kefy_brand_kits')
      .insert({ org_id: auth.orgId, brand_id: brand.id, name: brand.name })
      .select('*')
      .single();

    if (createError || !newKit) {
      console.error('brand-kit create error:', createError?.message);
      return NextResponse.json({ error: 'Failed to initialize brand kit' }, { status: 500 });
    }

    const res = NextResponse.json({ kit: newKit }, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  }

  const res = NextResponse.json({ kit });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
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
  const validationError = validateBrandKitUpdate(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  // Build safe update payload — only allow known fields
  const allowed: (keyof BrandKitUpdateInput)[] = [
    'name', 'tagline', 'industry', 'tone',
    'primary_color', 'secondary_color', 'accent_color',
    'font_heading', 'font_body', 'logo_url', 'notes',
    'website_url', 'social_urls', 'language', 'customer_locations',
    'uses_emojis', 'communication_style', 'mission',
    'company_size', 'differentiators', 'challenges',
    'niche', 'competitors', 'target_audience',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in input) update[key] = input[key] ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const db = createSupabaseServer();

  if (syncOrgName && typeof input.name === 'string' && input.name.trim()) {
    const syncedName = input.name.trim().slice(0, 100);

    const [{ error: orgUpdateError }, { error: brandUpdateError }] = await Promise.all([
      db
        .from('kefy_organizations')
        .update({ name: syncedName })
        .eq('id', auth.orgId),
      db
        .from('kefy_brands')
        .update({ name: syncedName })
        .eq('id', brand.id)
        .eq('org_id', auth.orgId),
    ]);

    if (orgUpdateError || brandUpdateError) {
      console.error('brand-kit sync name error:', orgUpdateError?.message ?? brandUpdateError?.message);
      return NextResponse.json({ error: 'Failed to sync organization name' }, { status: 500 });
    }
  }

  // Upsert: update if exists, insert if not
  const { data: existing } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('brand_id', brand.id)
    .maybeSingle();

  let kit;
  if (existing) {
    const { data, error } = await db
      .from('kefy_brand_kits')
      .update(update)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('brand-kit PATCH error:', error?.message);
      return NextResponse.json({ error: 'Failed to update brand kit' }, { status: 500 });
    }
    kit = data;
  } else {
    const { data, error } = await db
      .from('kefy_brand_kits')
      .insert({ org_id: auth.orgId, brand_id: brand.id, name: brand.name, ...update })
      .select('*')
      .single();

    if (error || !data) {
      console.error('brand-kit create error:', error?.message);
      return NextResponse.json({ error: 'Failed to create brand kit' }, { status: 500 });
    }
    kit = data;
  }

  const res = NextResponse.json({ kit });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
