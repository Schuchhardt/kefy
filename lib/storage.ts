import { createSupabaseServer } from '@/lib/supabase';

const CONTENT_IMAGES_BUCKET = 'kefy-content-images';

/**
 * Upload a base64-encoded image to Supabase Storage.
 * Returns the public URL of the uploaded file.
 *
 * @param b64      - raw base64 string (no data URI prefix)
 * @param orgId    - org UUID used as storage path prefix
 * @param filename - desired filename including extension (e.g. "slide-1.jpeg")
 */
export async function uploadBase64Image(
  b64: string,
  orgId: string,
  filename: string,
): Promise<string> {
  const buffer  = Buffer.from(b64, 'base64');
  const mime    = filename.endsWith('.png')  ? 'image/png'
                : filename.endsWith('.webp') ? 'image/webp'
                : 'image/jpeg';

  const path = `${orgId}/${Date.now()}-${filename}`;
  const db   = createSupabaseServer();

  const { error } = await db.storage
    .from(CONTENT_IMAGES_BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = db.storage.from(CONTENT_IMAGES_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not retrieve public URL after upload');

  return data.publicUrl;
}
