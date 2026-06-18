import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateReelScript, generateContentImage, type ContentChannel } from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 180;

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/reel ───────────────────────────────────────────────────
// Generate a short-form vertical reel storyboard.
// Claude writes the scene script; gpt-image-2 generates one background image
// per scene (optional). Stores the result as content_type='reel'.
//
// Body:
//   channel          — required
//   topic            — required
//   scene_count?     — 3–8 (default 5)
//   language?        — 'es' (default) | 'en'
//   generate_images? — boolean (default true)
//   image_quality?   — 'low' | 'medium' (default) | 'high'
//   save?                  — persist to DB (default true)
//   reference_image_urls?  — public URLs of reference images to guide AI image generation

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

  const rawCount    = typeof input.scene_count === 'number' ? input.scene_count : 5;
  const sceneCount  = Math.min(8, Math.max(3, Math.floor(rawCount)));
  const genImages   = input.generate_images !== false;  // default true
  const imageQuality = (['low', 'medium', 'high'] as const)
    .includes(input.image_quality as 'low' | 'medium' | 'high')
    ? (input.image_quality as 'low' | 'medium' | 'high')
    : 'medium';

  const db = createSupabaseServer();

  // Fetch brand kit context
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id, name, tagline, tone, industry, primary_color, secondary_color, accent_color, font_heading, logo_url')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // 1. Generate reel script with Claude
  let generated;
  try {
    generated = await generateReelScript({
      channel,
      topic:       (input.topic as string).trim().slice(0, 500),
      scene_count: sceneCount,
      language:    input.language === 'en' ? 'en' : 'es',
      tone:        brandKit?.tone ?? [],
      brandName:   brandKit?.name    ?? undefined,
      tagline:     brandKit?.tagline ?? undefined,
      extraCtx:    brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reel script generation failed';
    console.error('reel generate error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2. Optionally generate one background image per scene (portrait 9:16)
  const scenes = await Promise.all(
    generated.scenes.map(async (scene) => {
      if (!genImages) return { ...scene, image_url: undefined };

      try {
        // For reel backgrounds: do NOT pass logo (it's overlaid by Remotion, not baked in).
        // Do NOT pass referenceImages either — those are brand references, not backgrounds.
        const bgPrompt = `Background scene for a reel: ${scene.image_prompt}. NO text, NO words, NO letters, NO logos, NO watermarks, NO signs with writing, NO UI overlays. Pure cinematic background scene only.`;
        const imgResult = await generateContentImage({
          prompt:  bgPrompt,
          size:    '1024x1792',
          quality: imageQuality,
          brand: {
            name:           brandKit?.name           ?? undefined,
            primaryColor:   brandKit?.primary_color  ?? undefined,
            secondaryColor: brandKit?.secondary_color ?? undefined,
            accentColor:    brandKit?.accent_color   ?? undefined,
            tone:           brandKit?.tone           ?? undefined,
            // NO logoB64/logoMimeType — logo is overlaid by Remotion, must not be baked into background
          },
        });
        const imageUrl = await uploadBase64Image(
          imgResult.b64,
          auth.orgId,
          `reel-scene-${scene.scene_order}-${Date.now()}.jpeg`,
        );
        return { ...scene, image_url: imageUrl };
      } catch (imgErr) {
        console.warn(`Reel scene ${scene.scene_order} image failed:`, imgErr);
        return { ...scene, image_url: undefined };
      }
    }),
  );

  // Use the first scene's image as the item cover
  const coverImage = scenes.find((s) => s.image_url)?.image_url ?? null;

  if (input.save === false) {
    return NextResponse.json({
      scenes,
      hook:       generated.hook,
      hashtags:   generated.hashtags,
      model:      generated.model,
      tokensUsed: generated.tokensUsed,
    });
  }

  // 3. Persist as a content item with content_type='reel'
  const { data: item, error: itemError } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       auth.orgId,
      brand_id:     brand?.id ?? null,
      brand_kit_id: brandKit?.id ?? null,
      created_by:   auth.userId,
      channel,
      content_type: 'reel',
      title:        generated.hook || scenes[0]?.title || null,
      body:         generated.hook || null,
      image_url:    coverImage,
      slides:       scenes,   // scenes stored in slides column
      hashtags:     generated.hashtags,
      status:       'draft',
      metadata:     { scene_count: scenes.length, model: generated.model },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (itemError || !item) {
    console.error('reel item insert error:', itemError?.message);
    return NextResponse.json({ error: 'Failed to save reel' }, { status: 500 });
  }

  const res = NextResponse.json(
    {
      itemId:     item.id,
      scenes,
      hook:       generated.hook,
      hashtags:   generated.hashtags,
      model:      generated.model,
      tokensUsed: generated.tokensUsed,
    },
    { status: 201 },
  );
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
