import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const REFERENCE_IMAGES_BUCKET = 'kefy-reference-images';

// ─── POST /api/content/upload-reference ──────────────────────────────────────
// Upload a reference image to Supabase Storage.
// Reference images are used to guide AI image generation for reels and carousels.
//
// Expects multipart/form-data with a "file" field.
// Returns: { url: string }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart request' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 422 });
  }

  // Validate MIME type
  const mimeType = file.type;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Allowed: jpeg, png, webp, gif` },
      { status: 422 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max size is 10 MB` },
      { status: 422 },
    );
  }

  const ext        = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const filename   = file instanceof File ? (file as File).name : `reference-${Date.now()}.${ext}`;
  const storagePath = `${auth.orgId}/references/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const db = createSupabaseServer();

  // Ensure the bucket exists (will silently succeed if it already exists)
  await db.storage.createBucket(REFERENCE_IMAGES_BUCKET, { public: true }).catch(() => {/* already exists */});

  const { error: uploadError } = await db.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error('Reference image upload error:', uploadError.message);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }

  const { data } = db.storage.from(REFERENCE_IMAGES_BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
