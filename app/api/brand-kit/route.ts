import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { validateBrandKitUpdate, type BrandKitUpdateInput } from '@/lib/brand-kit';

// ─── GET /api/brand-kit ───────────────────────────────────────────────────────
// Returns the brand kit for the authenticated user's org.
// Creates a default kit if one doesn't exist yet.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();

  const { data: kit, error } = await db
    .from('kefy_brand_kits')
    .select('*')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (error) {
    console.error('brand-kit GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch brand kit' }, { status: 500 });
  }

  // Auto-create a default kit on first access
  if (!kit) {
    // Use the org's real name as the default brand name
    const { data: orgRow } = await db
      .from('kefy_organizations')
      .select('name')
      .eq('id', auth.orgId)
      .maybeSingle();

    const { data: newKit, error: createError } = await db
      .from('kefy_brand_kits')
      .insert({ org_id: auth.orgId, name: orgRow?.name ?? null })
      .select('*')
      .single();

    if (createError || !newKit) {
      console.error('brand-kit create error:', createError?.message);
      return NextResponse.json({ error: 'Failed to initialize brand kit' }, { status: 500 });
    }

    return NextResponse.json({ kit: newKit }, { status: 201 });
  }

  return NextResponse.json({ kit });
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
  const validationError = validateBrandKitUpdate(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  // Build safe update payload — only allow known fields
  const allowed: (keyof BrandKitUpdateInput)[] = [
    'name', 'tagline', 'industry', 'tone',
    'primary_color', 'secondary_color', 'accent_color',
    'font_heading', 'font_body', 'notes',
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

  const db = createSupabaseServer();

  // Upsert: update if exists, insert if not
  const { data: existing } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('org_id', auth.orgId)
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
      .insert({ org_id: auth.orgId, name: 'Mi marca', ...update })
      .select('*')
      .single();

    if (error || !data) {
      console.error('brand-kit create error:', error?.message);
      return NextResponse.json({ error: 'Failed to create brand kit' }, { status: 500 });
    }
    kit = data;
  }

  return NextResponse.json({ kit });
}
