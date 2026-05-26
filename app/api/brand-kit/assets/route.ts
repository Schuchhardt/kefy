import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { validateAssetUpload, STORAGE_BUCKET, type AssetType } from '@/lib/brand-kit';

// ─── GET /api/brand-kit/assets ────────────────────────────────────────────────
// List all assets for the org's brand kit.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();

  const { data: kit } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!kit) {
    return NextResponse.json({ assets: [] });
  }

  const { data: assets, error } = await db
    .from('kefy_brand_assets')
    .select('id, type, label, public_url, file_size, mime_type, created_at')
    .eq('brand_kit_id', kit.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('brand-kit assets GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }

  return NextResponse.json({ assets: assets ?? [] });
}

// ─── POST /api/brand-kit/assets ───────────────────────────────────────────────
// Upload a new asset. Expects multipart/form-data with:
//   file  — the image file (required)
//   type  — 'logo' | 'image' | 'icon' | 'other' (optional, default 'other')
//   label — human-readable label (optional)

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 422 });
  }

  const validationError = validateAssetUpload(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const rawType = formData.get('type');
  const assetType: AssetType =
    typeof rawType === 'string' && ['logo', 'image', 'icon', 'other'].includes(rawType)
      ? (rawType as AssetType)
      : 'other';

  const rawLabel = formData.get('label');
  const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim().slice(0, 100) : null;

  const { brand: postBrand, setCookieHeader: postCookieHeader } = await getBrandFromRequest(req, auth);
  if (!postBrand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const db = createSupabaseServer();

  // Ensure the brand kit exists (auto-create if not)
  let kitId: string;
  const { data: existingKit } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('brand_id', postBrand.id)
    .maybeSingle();

  if (existingKit) {
    kitId = existingKit.id;
  } else {
    const { data: newKit, error: kitError } = await db
      .from('kefy_brand_kits')
      .insert({ org_id: auth.orgId, brand_id: postBrand.id, name: postBrand.name })
      .select('id')
      .single();

    if (kitError || !newKit) {
      console.error('brand-kit auto-create error:', kitError?.message);
      return NextResponse.json({ error: 'Failed to initialize brand kit' }, { status: 500 });
    }
    kitId = newKit.id;
  }

  // Build storage path: brandId/kitId/timestamp-filename
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const storagePath = `${postBrand.id}/${kitId}/${Date.now()}-${safeFilename}`;

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError.message);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  const { data: { publicUrl } } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const { data: asset, error: dbError } = await db
    .from('kefy_brand_assets')
    .insert({
      brand_kit_id: kitId,
      org_id:       auth.orgId,
      type:         assetType,
      label,
      storage_path: storagePath,
      public_url:   publicUrl,
      file_size:    file.size,
      mime_type:    file.type,
    })
    .select('id, type, label, public_url, file_size, mime_type, created_at')
    .single();

  if (dbError || !asset) {
    // Try to clean up the uploaded file
    await db.storage.from(STORAGE_BUCKET).remove([storagePath]);
    console.error('brand-kit asset insert error:', dbError?.message);
    return NextResponse.json({ error: 'Failed to save asset' }, { status: 500 });
  }

  const res = NextResponse.json({ asset }, { status: 201 });
  if (postCookieHeader) res.headers.set('Set-Cookie', postCookieHeader);
  return res;
}
