// lib/publish-media.ts
// Single source of truth for "which media do we send to Zernio for this format".
//
// Why this exists: /api/social/publish and /api/social/schedule used to decide
// this inline, each with its own copy of the rules. When a reel had no rendered
// video the logic silently fell back to `image_url` (the reel cover), so the
// reel got published to Instagram/Facebook/TikTok as a *photo* instead of a
// video — no error, no warning. A reel must never degrade to a still image:
// if there is no video, publishing has to fail loudly.

import type { ContentType } from '@/types/content';

/** The row we publish from — either a content item or one of its renditions. */
export interface PublishMediaSource {
  body:             string | null;
  image_url:        string | null;
  slides:           unknown;
  video_url:        string | null;
  mux_playback_id?: string | null;
  hashtags?:        string[] | null;
}

export interface ResolvedPublishMedia {
  /** Caption to publish (for video posts the hashtags are inlined here). */
  text:        string;
  /** Hashtags for Zernio's dedicated field — empty for video posts. */
  hashtags:    string[];
  /** Single image (post/story/carousel-without-slides). Never set together with video_url. */
  image_url?:  string;
  /** Carousel slides. */
  media_urls?: string[];
  /** Video (reel, or story rendered as video). */
  video_url?:  string;
  /** True when this publish is a video post — callers must not add an image. */
  is_video:    boolean;
}

export type PublishMediaResult =
  | { ok: true;  media: ResolvedPublishMedia }
  | { ok: false; error: string };

/** Formats that are only ever published as video — never as a still image. */
const VIDEO_ONLY_FORMATS: ReadonlySet<ContentType> = new Set<ContentType>(['reel']);

function isPublishableVideoUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/**
 * Decide the media payload for a given format.
 *
 * Rules:
 *   reel     → requires a rendered video URL; fails otherwise (never an image).
 *   story    → video when rendered, image otherwise (stories can be image-only).
 *   carousel → the slide images; the cover image is NOT added on top of them
 *              (it is slide #1 already, and sending both duplicates it).
 *   post     → the single image.
 * A video post never carries an image alongside it — Zernio would publish two
 * separate media items (a photo *and* a video).
 */
export function resolvePublishMedia(
  format: ContentType,
  source: PublishMediaSource,
): PublishMediaResult {
  if (!source.body) return { ok: false, error: 'Content has no body text' };

  const hashtags = source.hashtags ?? [];
  const videoUrl = isPublishableVideoUrl(source.video_url) ? source.video_url.trim() : null;

  // ── Video formats ─────────────────────────────────────────────────────────
  if (videoUrl && (format === 'reel' || format === 'story')) {
    // Zernio's separate `hashtags` field is not always applied to video posts,
    // so inline them in the caption instead.
    const hashtagLine = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return {
      ok: true,
      media: {
        text:      hashtagLine ? `${source.body}\n\n${hashtagLine}` : source.body,
        hashtags:  [],
        video_url: videoUrl,
        is_video:  true,
      },
    };
  }

  if (VIDEO_ONLY_FORMATS.has(format)) {
    // A reel without a video is never publishable — fail instead of posting the cover.
    return {
      ok: false,
      error: source.mux_playback_id
        ? 'This reel was rendered with the legacy Mux pipeline and has no downloadable video URL. Re-render it before publishing.'
        : 'The reel video has not finished rendering yet. Render the video before publishing — a reel cannot be published as an image.',
    };
  }

  // ── Image formats ─────────────────────────────────────────────────────────
  const imageUrl = source.image_url ?? undefined;

  if (format === 'carousel') {
    const slides = Array.isArray(source.slides)
      ? (source.slides as Array<{ image_url?: string | null }>)
      : [];
    const mediaUrls = slides
      .map((s) => s?.image_url)
      .filter((u): u is string => typeof u === 'string' && !!u);

    if (mediaUrls.length > 0) {
      return { ok: true, media: { text: source.body, hashtags, media_urls: mediaUrls, is_video: false } };
    }
    if (!imageUrl) return { ok: false, error: 'The carousel has no slide images to publish' };
    return { ok: true, media: { text: source.body, hashtags, image_url: imageUrl, is_video: false } };
  }

  return { ok: true, media: { text: source.body, hashtags, image_url: imageUrl, is_video: false } };
}
