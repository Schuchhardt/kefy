import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import {
  generateReel,
  REEL_VARIANT_COUNT_MAX,
} from '@/lib/services/reel';
import type { ContentChannel } from '@/types/ai';

export const runtime = 'nodejs';
export const maxDuration = 180;

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/reel ───────────────────────────────────────────────────
// Generate a short-form vertical reel storyboard.
// Claude writes the scene script; gpt-image-2 generates one background image
// per scene (optional). Always saved as content_type='reel' — a reel never
// stays out of the library (see lib/services/reel.ts for why `save` isn't a
// thing here, unlike /api/content/generate or /api/content/carousel).
//
// Body:
//   channel          — required
//   topic            — required
//   scene_count?     — 3–8 (default 5)
//   language?        — 'es' (default) | 'en'
//   generate_images? — boolean (default true)
//   image_quality?   — 'low' | 'medium' (default) | 'high'
//   variant_count?   — 1–3 (default 1). >1 generates that many independent
//                      takes on the same topic, each its own item, grouped by
//                      metadata.variant_group_id so the library can show them
//                      side by side.
//   reference_image_urls?  — public URLs of reference images to guide AI image generation
//
// Single variant (default) responds with the same flat shape as before:
//   { itemId, scenes, hook, hashtags, model, tokensUsed }
// variant_count > 1 responds with:
//   { variant_group_id, requested_variant_count, variants: [{ itemId, variant_index, scenes, hook, hashtags, model, tokensUsed }] }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  // channel is optional — defaults to 'generic' (Zernio adapts per platform)
  let channel: ContentChannel = 'generic';
  if (input.channel !== undefined && input.channel !== null && input.channel !== '') {
    if (!VALID_CHANNELS.has(input.channel as ContentChannel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}` },
        { status: 422 },
      );
    }
    channel = input.channel as ContentChannel;
  }
  if (typeof input.topic !== 'string' || !input.topic.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 422 });
  }
  if (input.variant_count !== undefined) {
    const vc = input.variant_count;
    if (typeof vc !== 'number' || !Number.isFinite(vc) || vc < 1 || vc > REEL_VARIANT_COUNT_MAX) {
      return NextResponse.json(
        { error: `variant_count must be a number between 1 and ${REEL_VARIANT_COUNT_MAX}` },
        { status: 422 },
      );
    }
  }

  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';
  const ctx = serviceContext(auth, brand?.id ?? '', language, { brandScope: 'org', source: 'route' });

  try {
    const out = await generateReel(ctx, {
      topic:                 input.topic as string,
      channel,
      scene_count:           typeof input.scene_count === 'number' ? input.scene_count : undefined,
      generate_images:       input.generate_images as boolean | undefined,
      image_quality:         input.image_quality as 'low' | 'medium' | 'high' | undefined,
      reference_image_urls:  Array.isArray(input.reference_image_urls)
        ? input.reference_image_urls.filter((u): u is string => typeof u === 'string')
        : undefined,
      variant_count:         typeof input.variant_count === 'number' ? input.variant_count : undefined,
    });

    const isMultiVariant = out.requested_variant_count > 1;
    const payload = isMultiVariant
      ? {
          variant_group_id:        out.variant_group_id,
          requested_variant_count: out.requested_variant_count,
          variants:                out.variants,
        }
      : {
          itemId:     out.variants[0]?.itemId,
          scenes:     out.variants[0]?.scenes,
          hook:       out.variants[0]?.hook,
          hashtags:   out.variants[0]?.hashtags,
          model:      out.variants[0]?.model,
          tokensUsed: out.variants[0]?.tokensUsed,
        };

    const res = NextResponse.json(payload, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (e) {
    return serviceErrorResponse(e, { route: 'POST /api/content/reel', auth });
  }
}
