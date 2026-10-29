import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { deleteBrandAsset, updateBrandAsset } from '@/lib/services/brand-assets';

// ─── PATCH /api/brand-kit/assets/[assetId] ────────────────────────────────────
// Corrige la clasificación de un logo o ícono: { type?, variant?, background?,
// label? }. Solo owner/admin.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { assetId } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const ctx = serviceContext(auth, '', 'en', { brandScope: 'org', source: 'route' });
  try {
    const { asset } = await updateBrandAsset(ctx, assetId, {
      type: body.type as never,
      variant: body.variant as never,
      background: body.background as never,
      label: body.label as never,
    });
    return NextResponse.json({ asset });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/brand-kit/assets/[assetId]', auth });
  }
}

// ─── DELETE /api/brand-kit/assets/[assetId] ───────────────────────────────────
// Delete an asset by ID. Only owner/admin can delete. El asset puede ser de
// cualquier marca de la organización (brandScope 'org').

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { assetId } = await params;
  if (!assetId) {
    return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
  }

  const ctx = serviceContext(auth, '', 'en', { brandScope: 'org', source: 'route' });
  try {
    await deleteBrandAsset(ctx, assetId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/brand-kit/assets/[assetId]', auth });
  }
}
