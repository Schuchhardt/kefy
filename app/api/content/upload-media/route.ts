import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const BUCKET = 'kefy-content-media';

// ─── POST /api/content/upload-media ──────────────────────────────────────────
// Upload a publishable image or video to Supabase Storage.
// Used by the manual content creation flow and by the edit flow when the user
// wants to replace an AI-generated image (or upload a video for a manual reel).
//
// Expects multipart/form-data with a "file" field.
// Returns: { url: string, type: 'image' | 'video', mime: string, size: number }

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

  const mimeType = file.type;
  const isImage  = ALLOWED_IMAGE_TYPES.has(mimeType);
  const isVideo  = ALLOWED_VIDEO_TYPES.has(mimeType);

  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}` },
      { status: 422 },
    );
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max size is ${Math.round(maxSize / (1024 * 1024))} MB for ${isImage ? 'images' : 'videos'}` },
      { status: 422 },
    );
  }

  const ext       = mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') ?? 'bin';
  const filename  = file instanceof File ? (file as File).name : `media-${Date.now()}.${ext}`;
  const safeName  = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const subdir    = isImage ? 'images' : 'videos';
  const storagePath = `${auth.orgId}/${subdir}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const db = createSupabaseServer();

  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {/* already exists */});

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error('Media upload error:', uploadError.message);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(storagePath);

  return NextResponse.json(
    { url: data.publicUrl, type: isImage ? 'image' : 'video', mime: mimeType, size: file.size },
    { status: 201 },
  );
}
