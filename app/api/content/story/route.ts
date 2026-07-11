import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateContentText, generateContentImage, generateReelScript } from '@/lib/ai';
import type { ContentChannel } from '@/types/ai';
import { uploadBase64Image } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 90;

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/story ───────────────────────────────────────────────────
// Generate a Story: a short caption (same copywriter as posts) + one vertical
// (9:16) image. Stores the result as content_type='story'.
// A separate action can later turn it into a short vertical video by reusing
// the reel script + Remotion render pipeline (see reel/render/route.ts).
//
// Body:
//   channel   — optional (defaults to 'generic')
//   topic     — required
//   language? — 'es' (default) | 'en'
//   save?     — persist to DB (default true)

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

  const topic    = (input.topic as string).trim().slice(0, 500);
  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';

  const db = createSupabaseServer();

  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id, name, tagline, tone, industry, primary_color, secondary_color, accent_color, logo_url')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 1. Short caption — same copywriter used for posts.
  let text;
  try {
    text = await generateContentText({
      channel,
      topic,
      language,
      tone:      brandKit?.tone ?? [],
      brandName: brandKit?.name    ?? undefined,
      tagline:   brandKit?.tagline ?? undefined,
      extraCtx:  brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Story text generation failed';
    console.error('story generate error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2. One vertical (9:16) image for the story.
  let imageUrl: string | null = null;
  try {
    const imgResult = await generateContentImage({
      prompt: `Vertical story visual for: ${topic}. Eye-catching, mobile-first composition, no captions baked in.`,
      size:    '1024x1536',
      quality: 'medium',
      brand: {
        name:           brandKit?.name           ?? undefined,
        primaryColor:   brandKit?.primary_color  ?? undefined,
        secondaryColor: brandKit?.secondary_color ?? undefined,
        accentColor:    brandKit?.accent_color   ?? undefined,
        tone:           brandKit?.tone           ?? undefined,
      },
    });
    imageUrl = await uploadBase64Image(imgResult.b64, auth.orgId, `story-${Date.now()}.jpeg`);
  } catch (imgErr) {
    console.warn('Story image generation failed:', imgErr);
  }

  if (input.save === false) {
    return NextResponse.json({
      body:       text.body,
      hashtags:   text.hashtags,
      image_url:  imageUrl,
      model:      text.model,
      tokensUsed: text.tokensUsed,
    });
  }

  const { data: item, error: itemError } = await db
    .from('kefy_content_items')
    .insert({
      org_id:        auth.orgId,
      brand_id:      brand?.id ?? null,
      brand_kit_id:  brandKit?.id ?? null,
      created_by:    auth.userId,
      channel,
      content_type:  'story',
      body:          text.body,
      image_url:     imageUrl,
      hashtags:      text.hashtags,
      status:        'draft',
      render_status: 'not_rendered',
      metadata:      { model: text.model },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (itemError || !item) {
    console.error('story item insert error:', itemError?.message);
    return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });
  }

  const res = NextResponse.json(
    {
      itemId:     item.id,
      body:       text.body,
      hashtags:   text.hashtags,
      image_url:  imageUrl,
      model:      text.model,
      tokensUsed: text.tokensUsed,
    },
    { status: 201 },
  );
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}

// ─── PATCH /api/content/story ──────────────────────────────────────────────────
// "Generar video de esta story" — writes a short (1-3 scene) vertical script
// with Claude and a background image per scene, then stores it in `slides` so
// POST /api/content/reel/render (which accepts content_type 'reel' | 'story')
// can render it with the same Remotion pipeline used for reels.
//
// Body: { itemId: string }

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const input  = body as Record<string, unknown>;
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : null;
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 422 });

  const db = createSupabaseServer();

  const { data: item, error: fetchError } = await db
    .from('kefy_content_items')
    .select('id, content_type, channel, body, title')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .single();

  if (fetchError || !item) return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  if (item.content_type !== 'story') {
    return NextResponse.json({ error: 'Only story items can generate a video script' }, { status: 422 });
  }

  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('name, tagline, tone, industry, primary_color, secondary_color, accent_color')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  const topic = (item.title || item.body || '').slice(0, 500);
  if (!topic) return NextResponse.json({ error: 'Story has no text to base the video on' }, { status: 422 });

  let generated;
  try {
    generated = await generateReelScript({
      channel:     (item.channel as ContentChannel) ?? 'generic',
      topic,
      scene_count: 2,
      language:    'es',
      tone:        brandKit?.tone ?? [],
      brandName:   brandKit?.name    ?? undefined,
      tagline:     brandKit?.tagline ?? undefined,
      extraCtx:    brandKit?.industry ? `Industry: ${brandKit.industry}. Keep it short — this is a Story, not a full Reel.` : 'Keep it short — this is a Story, not a full Reel.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Story video script generation failed';
    console.error('story video script error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const scenes = await Promise.all(
    generated.scenes.map(async (scene) => {
      try {
        const bgPrompt = `Background scene for a vertical story: ${scene.image_prompt}. NO text, NO words, NO letters, NO logos, NO watermarks. Pure cinematic background scene only.`;
        const imgResult = await generateContentImage({
          prompt:  bgPrompt,
          size:    '1024x1792',
          quality: 'medium',
          brand: {
            name:           brandKit?.name           ?? undefined,
            primaryColor:   brandKit?.primary_color  ?? undefined,
            secondaryColor: brandKit?.secondary_color ?? undefined,
            accentColor:    brandKit?.accent_color   ?? undefined,
            tone:           brandKit?.tone           ?? undefined,
          },
        });
        const imageUrl = await uploadBase64Image(
          imgResult.b64,
          auth.orgId,
          `story-scene-${scene.scene_order}-${Date.now()}.jpeg`,
        );
        return { ...scene, image_url: imageUrl };
      } catch (imgErr) {
        console.warn(`Story scene ${scene.scene_order} image failed:`, imgErr);
        return { ...scene, image_url: undefined };
      }
    }),
  );

  const { error: updateError } = await db
    .from('kefy_content_items')
    .update({ slides: scenes, render_status: 'not_rendered' })
    .eq('id', itemId);

  if (updateError) {
    console.error('story slides update error:', updateError.message);
    return NextResponse.json({ error: 'Failed to save story video script' }, { status: 500 });
  }

  return NextResponse.json({ itemId, scenes });
}
