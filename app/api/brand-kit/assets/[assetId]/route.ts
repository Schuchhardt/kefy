import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { STORAGE_BUCKET } from '@/lib/brand-kit';

// ─── DELETE /api/brand-kit/assets/[assetId] ───────────────────────────────────
// Delete an asset by ID. Only owner/admin can delete.

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

  const db = createSupabaseServer();

  // Fetch asset — ensure it belongs to this org
  const { data: asset, error: fetchError } = await db
    .from('kefy_brand_assets')
    .select('id, storage_path, org_id')
    .eq('id', assetId)
    .eq('org_id', auth.orgId)   // ownership check
    .maybeSingle();

  if (fetchError) {
    console.error('brand-kit asset fetch error:', fetchError.message);
    return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 500 });
  }

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  // Delete from Storage
  const { error: storageError } = await db.storage
    .from(STORAGE_BUCKET)
    .remove([asset.storage_path]);

  if (storageError) {
    console.error('Storage delete error:', storageError.message);
    // Non-fatal: the file may not exist. Continue to delete DB record.
  }

  // Delete from DB
  const { error: dbError } = await db
    .from('kefy_brand_assets')
    .delete()
    .eq('id', asset.id);

  if (dbError) {
    console.error('brand-kit asset delete error:', dbError.message);
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
