import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import {
  generateContentText,
  generateContentImage,
  generateCarouselSlides,
  generateReelScript,
} from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';
import { compositeTextOnImage } from '@/lib/image-processor';
import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';

export const runtime = 'nodejs';
export const maxDuration = 180;

const FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

type ItemRow = {
  id:           string;
  content_type: ContentType;
  channel:      ContentChannel;
  title:        string | null;
  body:         string | null;
  hashtags:     string[];
  image_url:    string | null;
  slides:       unknown;
  video_url:    string | null;
  mux_playback_id: string | null;
  mux_asset_id:    string | null;
  render_status:   string | null;
};

/** The item's own columns, presented as its "primary" rendition. */
function primaryRendition(item: ItemRow) {
  return {
    id:              item.id,           // same id as the item — it IS the primary rendition
    content_item_id: item.id,
    format:          item.content_type,
    status:          'ready' as const,
    body:            item.body,
    hashtags:        item.hashtags ?? [],
    image_url:       item.image_url,
    slides:          item.slides ?? null,
    video_url:       item.video_url,
    mux_playback_id: item.mux_playback_id,
    mux_asset_id:    item.mux_asset_id,
    render_status:   item.render_status,
    error_message:   null,
    is_primary:      true,
  };
}

async function fetchItem(db: ReturnType<typeof createSupabaseServer>, itemId: string, orgId: string): Promise<ItemRow | null> {
  const { data } = await db
    .from('kefy_content_items')
    .select('id, content_type, channel, title, body, hashtags, image_url, slides, video_url, mux_playback_id, mux_asset_id, render_status')
    .eq('id', itemId)
    .eq('org_id', orgId)
    .maybeSingle();
  return (data as ItemRow | null) ?? null;
}

// ─── GET /api/content/[itemId]/renditions ─────────────────────────────────────
// Lists every format generated so far for this item: the primary format
// (synthesized from the item's own columns) plus any alternate-format
// renditions generated on demand (kefy_content_renditions).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const db = createSupabaseServer();

  const item = await fetchItem(db, itemId, auth.orgId);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rows } = await db
    .from('kefy_content_renditions')
    .select('*')
    .eq('content_item_id', itemId);

  const renditions = [primaryRendition(item)];
  for (const format of FORMATS) {
    if (format === item.content_type) continue; // already covered by the primary
    const row = (rows ?? []).find((r: { format: string }) => r.format === format);
    if (row) renditions.push({ ...row, is_primary: false });
  }

  return NextResponse.json({ renditions });
}

// ─── POST /api/content/[itemId]/renditions ────────────────────────────────────
// Generates (or returns, if already ready) the given format for this item —
// so the same topic can be published as post/carousel/reel/story depending
// on the destination network, without re-typing the idea from scratch.
//
// Body: { format: 'post' | 'carousel' | 'reel' | 'story' }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const input  = body as Record<string, unknown>;
  const format = input.format as ContentType;
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: `format must be one of: ${FORMATS.join(', ')}` }, { status: 422 });
  }

  const db = createSupabaseServer();
  const item = await fetchItem(db, itemId, auth.orgId);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Already the primary format — nothing to generate.
  if (format === item.content_type) {
    return NextResponse.json({ rendition: primaryRendition(item) });
  }

  // Already generated and ready — return as-is (idempotent).
  const { data: existing } = await db
    .from('kefy_content_renditions')
    .select('*')
    .eq('content_item_id', itemId)
    .eq('format', format)
    .maybeSingle();
  if (existing?.status === 'ready') {
    return NextResponse.json({ rendition: existing });
  }

  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id, name, tagline, tone, industry, primary_color, secondary_color, accent_color')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  const topic = (item.title || item.body || '').slice(0, 500);
  if (!topic) return NextResponse.json({ error: 'Item has no text to base a new format on' }, { status: 422 });

  const brandName = brandKit?.name ?? undefined;
  const tagline   = brandKit?.tagline ?? undefined;
  const tone      = brandKit?.tone ?? [];
  const extraCtx  = brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined;

  try {
    let patch: Record<string, unknown>;

    if (format === 'post') {
      const text = await generateContentText({ channel: item.channel, topic, language: 'es', tone, brandName, tagline, extraCtx });
      const img  = await generateContentImage({ prompt: `${topic}. ${text.body.slice(0, 200)}`, size: '1024x1024', quality: 'medium', brand: { name: brandName, primaryColor: brandKit?.primary_color ?? undefined, secondaryColor: brandKit?.secondary_color ?? undefined, accentColor: brandKit?.accent_color ?? undefined, tone } });
      const imageUrl = await uploadBase64Image(img.b64, auth.orgId, `rendition-post-${Date.now()}.jpeg`);
      patch = { body: text.body, hashtags: text.hashtags, image_url: imageUrl, status: 'ready' };

    } else if (format === 'carousel') {
      const generated = await generateCarouselSlides({ channel: item.channel, topic, slide_count: 5, language: 'es', tone, brandName, tagline, extraCtx });
      const slides = await Promise.all(generated.slides.map(async (slide) => {
        if (!slide.image_prompt) return { ...slide, image_url: null };
        try {
          const imgResult = await generateContentImage({ prompt: slide.image_prompt, size: '1024x1024', quality: 'medium' });
          let finalB64 = imgResult.b64;
          try { finalB64 = await compositeTextOnImage(imgResult.b64, slide.title, slide.body ?? ''); } catch { /* keep plain image */ }
          const imageUrl = await uploadBase64Image(finalB64, auth.orgId, `rendition-carousel-slide-${slide.slide_order}-${Date.now()}.jpeg`);
          return { ...slide, image_url: imageUrl };
        } catch {
          return { ...slide, image_url: null };
        }
      }));
      patch = { body: generated.description, hashtags: generated.hashtags, slides, image_url: slides[0]?.image_url ?? null, status: 'ready' };

    } else if (format === 'reel') {
      const generated = await generateReelScript({ channel: item.channel, topic, scene_count: 5, language: 'es', tone, brandName, tagline, extraCtx });
      const scenes = await Promise.all(generated.scenes.map(async (scene) => {
        try {
          const bgPrompt = `Background scene for a reel: ${scene.image_prompt}. NO text, NO words, NO letters, NO logos, NO watermarks. Pure cinematic background scene only.`;
          const imgResult = await generateContentImage({ prompt: bgPrompt, size: '1024x1792', quality: 'medium', brand: { name: brandName, primaryColor: brandKit?.primary_color ?? undefined, secondaryColor: brandKit?.secondary_color ?? undefined, accentColor: brandKit?.accent_color ?? undefined, tone } });
          const imageUrl = await uploadBase64Image(imgResult.b64, auth.orgId, `rendition-reel-scene-${scene.scene_order}-${Date.now()}.jpeg`);
          return { ...scene, image_url: imageUrl };
        } catch {
          return { ...scene, image_url: undefined };
        }
      }));
      patch = { body: generated.hook, hashtags: generated.hashtags, slides: scenes, image_url: scenes.find((s) => s.image_url)?.image_url ?? null, render_status: 'not_rendered', status: 'ready' };

    } else {
      // story
      const text = await generateContentText({ channel: item.channel, topic, language: 'es', tone, brandName, tagline, extraCtx });
      const img  = await generateContentImage({ prompt: `Vertical story visual for: ${topic}. Eye-catching, mobile-first composition, no captions baked in.`, size: '1024x1536', quality: 'medium', brand: { name: brandName, primaryColor: brandKit?.primary_color ?? undefined, secondaryColor: brandKit?.secondary_color ?? undefined, accentColor: brandKit?.accent_color ?? undefined, tone } });
      const imageUrl = await uploadBase64Image(img.b64, auth.orgId, `rendition-story-${Date.now()}.jpeg`);
      patch = { body: text.body, hashtags: text.hashtags, image_url: imageUrl, render_status: 'not_rendered', status: 'ready' };
    }

    const { data: rendition, error: upsertError } = await db
      .from('kefy_content_renditions')
      .upsert(
        { content_item_id: itemId, format, ...patch },
        { onConflict: 'content_item_id,format' },
      )
      .select('*')
      .single();

    if (upsertError || !rendition) {
      console.error('rendition upsert error:', upsertError?.message);
      return NextResponse.json({ error: 'Failed to save rendition' }, { status: 500 });
    }

    return NextResponse.json({ rendition }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : `Failed to generate ${format} rendition`;
    console.error(`rendition generate error (${format}):`, msg);
    await db
      .from('kefy_content_renditions')
      .upsert(
        { content_item_id: itemId, format, status: 'error', error_message: msg },
        { onConflict: 'content_item_id,format' },
      );
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
