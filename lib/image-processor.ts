import sharp from 'sharp';
import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';

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

// Reels and Stories are always vertical 9:16 regardless of destination
// network — unlike posts, which follow each platform's canonical crop.
const VERTICAL_SIZE = { width: 1080, height: 1920 };

/**
 * Resize (cover-fit + center-crop) an image buffer for the given (platform, format)
 * pair. Reel/Story formats always use the vertical 9:16 crop; other formats fall
 * back to the platform's canonical size.
 */
export async function resizeForFormat(
  input: Buffer,
  platform: ContentChannel,
  format: ContentType,
  quality = 88,
): Promise<Buffer> {
  const { width, height } = (format === 'reel' || format === 'story')
    ? VERTICAL_SIZE
    : (PLATFORM_SIZES[platform] ?? PLATFORM_SIZES.generic);

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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Composite title and body text onto a base64 image using Sharp + SVG overlay.
 * Returns a new base64 JPEG string with text baked into the image.
 */
export async function compositeTextOnImage(
  imageBase64: string,
  title: string,
  body: string,
): Promise<string> {
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const metadata    = await sharp(imageBuffer).metadata();
  const w           = metadata.width  ?? 1024;
  const h           = metadata.height ?? 1024;

  const pad            = Math.round(w * 0.055);
  const titleSize      = Math.round(w * 0.054);
  const bodySize       = Math.round(w * 0.034);
  const titleLineH     = Math.round(titleSize * 1.28);
  const bodyLineH      = Math.round(bodySize  * 1.45);
  const blockGap       = Math.round(bodySize  * 0.7);
  const strokeW        = Math.max(3, Math.round(w * 0.003));
  const maxTitleChars  = Math.round((w - pad * 2) / (titleSize * 0.52));
  const maxBodyChars   = Math.round((w - pad * 2) / (bodySize  * 0.52));

  const titleLines = wrapText(title, maxTitleChars);
  const bodyLines  = body ? wrapText(body, maxBodyChars) : [];

  const totalTextH =
    titleLines.length * titleLineH +
    (bodyLines.length > 0 ? blockGap + bodyLines.length * bodyLineH : 0);

  const gradientStartY = Math.max(0, h - totalTextH - pad * 3.5);

  // Baseline of the first title line
  const titleBaseY = h - pad - (bodyLines.length > 0 ? bodyLines.length * bodyLineH + blockGap : 0) - (titleLines.length - 1) * titleLineH;
  // Baseline of the first body line
  const bodyBaseY  = titleBaseY + titleLines.length * titleLineH + blockGap;

  const titleSvg = titleLines.map((line, i) =>
    `<text x="${pad}" y="${titleBaseY + i * titleLineH}"
      font-family="Arial, Helvetica, system-ui, sans-serif"
      font-size="${titleSize}" font-weight="900" fill="#ffffff"
      paint-order="stroke" stroke="rgba(0,0,0,0.55)" stroke-width="${strokeW}"
      stroke-linejoin="round">${escapeXml(line)}</text>`,
  ).join('\n');

  const bodySvg = bodyLines.map((line, i) =>
    `<text x="${pad}" y="${bodyBaseY + i * bodyLineH}"
      font-family="Arial, Helvetica, system-ui, sans-serif"
      font-size="${bodySize}" font-weight="400" fill="rgba(255,255,255,0.90)"
      paint-order="stroke" stroke="rgba(0,0,0,0.50)" stroke-width="${Math.max(2, strokeW - 1)}"
      stroke-linejoin="round">${escapeXml(line)}</text>`,
  ).join('\n');

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.78)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientStartY}" width="${w}" height="${h - gradientStartY}" fill="url(#overlay)"/>
  ${titleSvg}
  ${bodySvg}
</svg>`;

  const result = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return result.toString('base64');
}
