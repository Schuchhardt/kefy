import sharp from 'sharp';
import type { ContentChannel } from '@/types/ai';

// ─── Platform-specific image dimensions ───────────────────────────────────────
// Width × Height in pixels for the primary/recommended crop per network.

const PLATFORM_SIZES: Record<ContentChannel, { width: number; height: number }> = {
  linkedin:  { width: 1200, height: 627  },
  instagram: { width: 1080, height: 1080 },
  facebook:  { width: 1200, height: 630  },
  twitter:   { width: 1200, height: 675  },
  tiktok:    { width: 1080, height: 1920 },
  threads:   { width: 1080, height: 1080 },
  generic:   { width: 1200, height: 630  },
};

/**
 * Resize (cover-fit + center-crop) an image buffer to the canonical size
 * for the given platform. Returns a JPEG buffer.
 *
 * @param input    - Source image as Buffer (JPEG/PNG/WebP/etc.)
 * @param platform - Target social channel
 * @param quality  - JPEG quality 1-100 (default 88)
 */
export async function resizeForPlatform(
  input: Buffer,
  platform: ContentChannel,
  quality = 88,
): Promise<Buffer> {
  const { width, height } = PLATFORM_SIZES[platform] ?? PLATFORM_SIZES.generic;

  return sharp(input)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/**
 * Resize an image for multiple platforms simultaneously.
 * Returns a map of platform → JPEG Buffer.
 */
export async function resizeForPlatforms(
  input: Buffer,
  platforms: ContentChannel[],
  quality = 88,
): Promise<Map<ContentChannel, Buffer>> {
  const entries = await Promise.all(
    platforms.map(async (p) => {
      const buf = await resizeForPlatform(input, p, quality);
      return [p, buf] as [ContentChannel, Buffer];
    }),
  );
  return new Map(entries);
}

/**
 * Convert a base64 JPEG/PNG string to a Buffer.
 */
export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}
