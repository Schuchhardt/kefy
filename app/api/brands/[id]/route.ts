import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { validateBrandAccess } from '@/lib/brands';

// ─── PATCH /api/brands/[id] ───────────────────────────────────────────────────
// Update brand name and/or avatar_url.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const brand = await validateBrandAccess(id, auth);
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (typeof input.name === 'string') {
    const name = input.name.trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 422 });
    update.name = name;
  }
  if ('avatar_url' in input) {
    update.avatar_url = typeof input.avatar_url === 'string' && input.avatar_url.trim()
      ? input.avatar_url.trim()
      : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 });
  }

  const db = createSupabaseServer();

  const { data: updated, error } = await db
    .from('kefy_brands')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('brands PATCH error:', error?.message);
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });
  }

  return NextResponse.json({ brand: updated });
}

// ─── DELETE /api/brands/[id] ──────────────────────────────────────────────────
// Soft-delete (archive) a brand. Cannot archive the last active brand.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const brand = await validateBrandAccess(id, auth);
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  if (brand.archived) {
    return NextResponse.json({ error: 'Brand is already archived' }, { status: 409 });
  }

  const db = createSupabaseServer();

  // Prevent archiving the last active brand
  const { count } = await db
    .from('kefy_brands')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .eq('archived', false);

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Cannot archive the only active brand' }, { status: 409 });
  }

  const { error } = await db
    .from('kefy_brands')
    .update({ archived: true })
    .eq('id', id);

  if (error) {
    console.error('brands DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to archive brand' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
