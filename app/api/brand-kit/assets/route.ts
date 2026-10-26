import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { validateAssetUpload } from '@/lib/brand-kit';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listBrandAssets, uploadBrandAsset } from '@/lib/services/brand-assets';
import type { AssetType } from '@/types/brand-kit';

// ─── GET /api/brand-kit/assets ────────────────────────────────────────────────
// Assets del Brand Kit de la marca activa (lib/services/brand-assets.ts).

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ assets: [] });
  }

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const res = NextResponse.json(await listBrandAssets(ctx));
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/brand-kit/assets', auth });
  }
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
  const rawLabel = formData.get('label');

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.json({ error: 'No brand found' }, { status: 404 });
  }

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const { asset } = await uploadBrandAsset(ctx, {
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name,
      type: typeof rawType === 'string' ? (rawType as AssetType) : undefined,
      label: typeof rawLabel === 'string' ? rawLabel : null,
    });
    const res = NextResponse.json({ asset }, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/brand-kit/assets', auth });
  }
}
