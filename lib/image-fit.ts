import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';

// Pure geometry helpers — deliberately free of `sharp` so the preview
// components can share the exact same aspect-ratio rules as the publisher.

// ─── Platform-specific image geometry ─────────────────────────────────────────
// Every network accepts a *range* of aspect ratios, not a single one. Forcing
// every upload into one canonical crop is what used to slice the top/bottom off
// images the user had already exported at the right size (e.g. a 1080×1350
// Instagram-ready photo being center-cropped to 1080×1080).
//
//   aspect  — accepted width/height range. Inside it we never crop.
//   maxBox  — largest dimensions we upload; images are downscaled to fit.
//   target  — fallback crop used only when the source dimensions are unknown.

interface PlatformImageSpec {
  minAspect: number;                              // narrowest (tallest) allowed w/h
  maxAspect: number;                              // widest allowed w/h
  maxBox:    { width: number; height: number };
  target:    { width: number; height: number };
}

const PORTRAIT_4_5 = 4 / 5;   // 0.8   — tallest crop Instagram/Facebook/LinkedIn accept
const LANDSCAPE_191 = 1.91;   //        — widest crop the Meta family accepts
const VERTICAL_9_16 = 9 / 16; // 0.5625

// Common "1.91:1" exports are really 1200×628 (1.9108) — a hair over the
// nominal limit. Cropping half a percent off an otherwise correct image is pure
// loss, so allow a 1% slack on both ends of every range.
const ASPECT_TOLERANCE = 0.01;

const PLATFORM_SPECS: Record<ContentChannel, PlatformImageSpec> = {
  // Feed posts: 4:5 portrait → 1.91:1 landscape. 1080×1350 is Instagram's own
  // recommended export size, so an image already at that ratio passes untouched.
  instagram: { minAspect: PORTRAIT_4_5,  maxAspect: LANDSCAPE_191, maxBox: { width: 1440, height: 1800 }, target: { width: 1080, height: 1350 } },
  threads:   { minAspect: PORTRAIT_4_5,  maxAspect: LANDSCAPE_191, maxBox: { width: 1440, height: 1800 }, target: { width: 1080, height: 1350 } },
  facebook:  { minAspect: PORTRAIT_4_5,  maxAspect: LANDSCAPE_191, maxBox: { width: 1440, height: 1800 }, target: { width: 1200, height: 630  } },
  linkedin:  { minAspect: PORTRAIT_4_5,  maxAspect: LANDSCAPE_191, maxBox: { width: 1440, height: 1800 }, target: { width: 1200, height: 627  } },
  // X renders portrait media up to 4:5 and wide media up to 2:1 without its own crop.
  twitter:   { minAspect: PORTRAIT_4_5,  maxAspect: 2,             maxBox: { width: 1600, height: 1900 }, target: { width: 1600, height: 900  } },
  // TikTok photo posts are a vertical surface: never wider than square.
  tiktok:    { minAspect: VERTICAL_9_16, maxAspect: 1,             maxBox: { width: 1080, height: 1920 }, target: { width: 1080, height: 1920 } },
  // No known destination → be permissive, only downscale.
  generic:   { minAspect: VERTICAL_9_16, maxAspect: LANDSCAPE_191, maxBox: { width: 1440, height: 1800 }, target: { width: 1200, height: 630  } },
};

// Reels and Stories are always vertical 9:16 regardless of destination
// network — unlike posts, which follow each platform's accepted range.
const VERTICAL_SIZE = { width: 1080, height: 1920 };

/**
 * How a source image should be fitted for a (platform, format) pair.
 *   'contain' — scale down only, aspect preserved, nothing is cut.
 *   'cover'   — center-crop to the given box (source is outside the accepted range).
 */
export type ImageFitPlan = {
  mode:   'contain' | 'cover';
  width:  number;
  height: number;
};

function scaleToBox(width: number, height: number, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / width, maxH / height);
  return {
    width:  Math.max(1, Math.round(width  * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decide the output geometry for an image without touching pixels — pure, so it
 * can be unit-tested on its own.
 *
 * @param srcWidth  - Source width in px (0/unknown → canonical fallback crop)
 * @param srcHeight - Source height in px
 * @param platform  - Target social channel
 * @param format    - Content format; reel/story force the 9:16 vertical crop
 */
export function planImageFit(
  srcWidth:  number,
  srcHeight: number,
  platform:  ContentChannel,
  format:    ContentType,
): ImageFitPlan {
  if (format === 'reel' || format === 'story') {
    return { mode: 'cover', ...VERTICAL_SIZE };
  }

  const spec = PLATFORM_SPECS[platform] ?? PLATFORM_SPECS.generic;

  // Dimensions unreadable → fall back to the old canonical crop.
  if (!srcWidth || !srcHeight) return { mode: 'cover', ...spec.target };

  const aspect = srcWidth / srcHeight;

  // Already a shape the network accepts: keep every pixel, only downscale.
  if (
    aspect >= spec.minAspect * (1 - ASPECT_TOLERANCE) &&
    aspect <= spec.maxAspect * (1 + ASPECT_TOLERANCE)
  ) {
    return { mode: 'contain', ...scaleToBox(srcWidth, srcHeight, spec.maxBox.width, spec.maxBox.height) };
  }

  // Outside the accepted range: crop to the *nearest* limit, not to the
  // canonical size, so we cut as little as possible.
  const cropped = aspect > spec.maxAspect
    ? { width: Math.round(srcHeight * spec.maxAspect), height: srcHeight }  // too wide → trim sides
    : { width: srcWidth, height: Math.round(srcWidth / spec.minAspect) };   // too tall → trim top/bottom

  return { mode: 'cover', ...scaleToBox(cropped.width, cropped.height, spec.maxBox.width, spec.maxBox.height) };
}

/**
 * The aspect-ratio range (width/height) a network accepts for a feed post.
 * Shared with the in-app previews so the preview crops exactly where the
 * publisher would — and, more importantly, doesn't crop where it wouldn't.
 */
export function aspectLimitsFor(platform: ContentChannel): { min: number; max: number } {
  const spec = PLATFORM_SPECS[platform] ?? PLATFORM_SPECS.generic;
  return {
    min: spec.minAspect * (1 - ASPECT_TOLERANCE),
    max: spec.maxAspect * (1 + ASPECT_TOLERANCE),
  };
}
