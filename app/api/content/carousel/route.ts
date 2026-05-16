import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { generateCarouselSlides, generateContentImage, type ContentChannel } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

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

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (!input.channel || !VALID_CHANNELS.has(input.channel as ContentChannel)) {
    return NextResponse.json(
      { error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}` },
      { status: 422 },
    );
  }
  if (typeof input.topic !== 'string' || !input.topic.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 422 });
  }

  const rawCount    = typeof input.slide_count === 'number' ? input.slide_count : 5;
  const slideCount  = Math.min(10, Math.max(3, Math.floor(rawCount)));
  const genImages   = input.generate_images === true;
  const imageQuality = (['low', 'medium', 'high'] as const)
    .includes(input.image_quality as 'low' | 'medium' | 'high')
    ? (input.image_quality as 'low' | 'medium' | 'high')
    : 'medium';

  const db = createSupabaseServer();

  // Fetch brand kit context
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('name, tagline, tone, industry')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 1. Generate slide copy with Claude
  let generated;
  try {
    generated = await generateCarouselSlides({
      channel:     input.channel as ContentChannel,
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

  // 2. Optionally generate one image per slide in parallel
  const slides = await Promise.all(
    generated.slides.map(async (slide) => {
      if (!genImages || !slide.image_prompt) return { ...slide, image_url: null };

      try {
        const imgResult = await generateContentImage({
          prompt:  slide.image_prompt,
          size:    '1024x1024',
          quality: imageQuality,
        });
        const imageUrl = await uploadBase64Image(
          imgResult.b64,
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
    return NextResponse.json({ slides, model: generated.model, tokensUsed: generated.tokensUsed });
  }

  // 3. Persist as a content item with content_type='carousel'
  const firstSlide = slides[0];
  const { data: item, error: itemError } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       auth.orgId,
      created_by:   auth.userId,
      channel:      input.channel,
      content_type: 'carousel',
      title:        firstSlide?.title ?? null,
      body:         firstSlide?.body  ?? null,
      image_url:    firstSlide?.image_url ?? null,
      slides:       JSON.stringify(slides),
      hashtags:     [],
      status:       'draft',
      metadata:     { slide_count: slides.length, model: generated.model },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (itemError || !item) {
    console.error('carousel item insert error:', itemError?.message);
    return NextResponse.json({ error: 'Failed to save carousel' }, { status: 500 });
  }

  return NextResponse.json(
    { itemId: item.id, slides, model: generated.model, tokensUsed: generated.tokensUsed },
    { status: 201 },
  );
}
