import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { deleteBrandAsset } from '@/lib/services/brand-assets';

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
