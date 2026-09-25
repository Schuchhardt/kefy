import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { generateCarousel } from '@/lib/services/content';
import type { ContentChannel } from '@/types/ai';

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/carousel ───────────────────────────────────────────────
// Generate a multi-slide carousel.
// Claude writes copy for each slide; gpt-image-2 optionally generates one image per slide.
//
// Body:
//   channel          — required
//   topic            — required
//   slide_count?     — number of slides (3–10, default 5)
//   language?        — 'es' (default) | 'en'
//   generate_images? — boolean (default false); if true, generates one image per slide
//   image_quality?   — 'low' | 'medium' (default) | 'high'
//   save?            — persist to DB (default true)

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

  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';
  const shouldSave = input.save !== false;

  // Texto (1 crédito, con la guardia de gasto) e imágenes por slide (cada una
  // cobrada aparte con consumeCredits/refundCredits): generateCarousel.
  const ctx = serviceContext(auth, brand?.id ?? '', language, { brandScope: 'org', source: 'route' });
  try {
    const out = await generateCarousel(ctx, {
      topic:          input.topic as string,
      channel,
      slideCount:     typeof input.slide_count === 'number' ? input.slide_count : undefined,
      // Images now default to TRUE (always-on policy for AI-recommended content)
      generateImages: input.generate_images !== false,
      imageQuality:   (['low', 'medium', 'high'] as const).includes(input.image_quality as 'low' | 'medium' | 'high')
        ? (input.image_quality as 'low' | 'medium' | 'high')
        : 'medium',
      save:           shouldSave,
    });

    if (!shouldSave) {
      return NextResponse.json({
        slides:      out.slides,
        description: out.description,
        hashtags:    out.hashtags,
        model:       out.model,
        tokensUsed:  out.tokensUsed,
      });
    }

    const res = NextResponse.json(
      {
        itemId:      out.itemId,
        slides:      out.slides,
        description: out.description,
        hashtags:    out.hashtags,
        model:       out.model,
        tokensUsed:  out.tokensUsed,
      },
      { status: 201 },
    );
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (e) {
    return serviceErrorResponse(e, { route: 'POST /api/content/carousel', auth });
  }
}
