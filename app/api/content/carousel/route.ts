import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateCarouselSlides, generateContentImage } from '@/lib/ai';
import type { ContentChannel } from '@/types/ai';
import { uploadBase64Image } from '@/lib/storage';
import { compositeTextOnImage } from '@/lib/image-processor';

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

  const rawCount    = typeof input.slide_count === 'number' ? input.slide_count : 5;
  const slideCount  = Math.min(10, Math.max(3, Math.floor(rawCount)));
  // Images now default to TRUE (always-on policy for AI-recommended content)
  const genImages   = input.generate_images !== false;
  const imageQuality = (['low', 'medium', 'high'] as const)
    .includes(input.image_quality as 'low' | 'medium' | 'high')
    ? (input.image_quality as 'low' | 'medium' | 'high')
    : 'medium';

  const db = createSupabaseServer();

  // Fetch brand kit context
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id, name, tagline, tone, industry')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 1. Generate slide copy with Claude
  let generated;
  try {
    generated = await generateCarouselSlides({
      channel,
      topic:       (input.topic as string).trim().slice(0, 500),
      slide_count: slideCount,
      language:    input.language === 'en' ? 'en' : 'es',
      tone:        brandKit?.tone ?? [],
      brandName:   brandKit?.name    ?? undefined,
      tagline:     brandKit?.tagline ?? undefined,
      extraCtx:    brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Carousel text generation failed';
    console.error('carousel generate error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2. Optionally generate one image per slide in parallel (with text composited in)
  const slides = await Promise.all(
    generated.slides.map(async (slide) => {
      if (!genImages || !slide.image_prompt) return { ...slide, image_url: null };

      try {
        const imgResult = await generateContentImage({
          prompt:  slide.image_prompt,
          size:    '1024x1024',
          quality: imageQuality,
        });

        // Composite slide title + body text onto the image
        let finalB64 = imgResult.b64;
        try {
          finalB64 = await compositeTextOnImage(imgResult.b64, slide.title, slide.body ?? '');
        } catch (compErr) {
          console.warn(`Carousel slide ${slide.slide_order} text composite failed:`, compErr);
        }

        const imageUrl = await uploadBase64Image(
          finalB64,
          auth.orgId,
          `carousel-slide-${slide.slide_order}-${Date.now()}.jpeg`,
        );
        return { ...slide, image_url: imageUrl };
      } catch (imgErr) {
        console.warn(`Carousel slide ${slide.slide_order} image failed:`, imgErr);
        return { ...slide, image_url: null };
      }
    }),
  );

  const shouldSave = input.save !== false;
  if (!shouldSave) {
    return NextResponse.json({
      slides,
      description: generated.description,
      hashtags:    generated.hashtags,
      model:       generated.model,
      tokensUsed:  generated.tokensUsed,
    });
  }

  // 3. Persist as a content item with content_type='carousel'
  const firstSlide = slides[0];
  const { data: item, error: itemError } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       auth.orgId,
      brand_id:     brand?.id ?? null,
      brand_kit_id: brandKit?.id ?? null,
      created_by:   auth.userId,
      channel,
      content_type: 'carousel',
      title:        firstSlide?.title ?? null,
      body:         generated.description,
      image_url:    firstSlide?.image_url ?? null,
      slides:       slides,
      hashtags:     generated.hashtags,
      status:       'draft',
      metadata:     { slide_count: slides.length, model: generated.model },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (itemError || !item) {
    console.error('carousel item insert error:', itemError?.message);
    return NextResponse.json({ error: 'Failed to save carousel' }, { status: 500 });
  }

  const res = NextResponse.json(
    {
      itemId:      item.id,
      slides,
      description: generated.description,
      hashtags:    generated.hashtags,
      model:       generated.model,
      tokensUsed:  generated.tokensUsed,
    },
    { status: 201 },
  );
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
