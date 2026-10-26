// ─── Servicio: stories ────────────────────────────────────────────────────────
//
// Lógica de POST y PATCH /api/content/story, compartida con las herramientas
// create_story y prepare_story_video del asistente.
//
// - generateStory: texto corto (el mismo redactor que los posts, 1 crédito) y
//   una imagen vertical 9:16 (3 créditos). La imagen es opcional: si no hay
//   créditos para ella o falla, la story se guarda solo con texto.
// - writeStoryVideoScript: «Generar video de esta story». Escribe un guion de
//   1–3 planos (1 crédito) en metadata.video_script y no produce nada: el
//   video sale después por el pipeline de lib/services/video.ts, igual que un
//   reel. Sin este paso, get_video_plan/produce_video de una story fallan con
//   «no tiene guion ni escenas».
//
// El kit se lee por brand_id (getBrandKitForBrand). La ruta lo buscaba con
// `.eq('org_id').maybeSingle()`, que con más de una marca no devuelve nada.

import { createSupabaseServer } from '@/lib/supabase';
import { generateContentText, generateContentImage, generateVideoScript, describeImageAsTopic } from '@/lib/ai';
import { buildDerivedTopic, topicImageFor } from '@/lib/content-source';
import { consumeCredits, refundCredits } from '@/lib/usage';
import { uploadBase64Image } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import { scriptToReelScenes } from '@/lib/video/script';
import { videoBrandBrief } from '@/lib/video/brand';
import type { ContentChannel, GenerateTextResult } from '@/types/ai';
import type { BrandKit } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow } from '@/lib/services/errors';
import { loadOwnedItem } from '@/lib/services/ownership';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';
import { createdVia } from '@/lib/services/content';

const POST_ROUTE = 'POST /api/content/story';
const PATCH_ROUTE = 'PATCH /api/content/story';

type KitRow = Pick<BrandKit, 'id' | 'name' | 'tagline' | 'tone' | 'industry' | 'primary_color' | 'secondary_color' | 'accent_color'>;

async function loadKit(brandId: string | null | undefined): Promise<KitRow | null> {
  if (!brandId) return null;
  // Como en el resto de generaciones, un error al leer el kit no es fatal.
  const { data } = await getBrandKitForBrand(createSupabaseServer(), brandId);
  return (data ?? null) as KitRow | null;
}

// ─── generateStory ────────────────────────────────────────────────────────────

export interface GenerateStoryInput {
  topic: string;
  channel?: ContentChannel;
  /** Por defecto, true. */
  withImage?: boolean;
  /** Referencias para la imagen (máx. 3), ya en el Storage de Kefy. */
  referenceImageUrls?: string[];
  /** false → solo genera, no guarda. Por defecto, true. */
  save?: boolean;
}

export interface GenerateStoryResult {
  itemId?: string;
  body: string;
  hashtags: string[];
  image_url: string | null;
  model: string;
  tokensUsed: number;
  /** Por qué la story salió sin imagen, si se pidió. */
  imageError?: 'credits_exhausted' | 'failed';
}

export async function generateStory(ctx: ServiceContext, input: GenerateStoryInput): Promise<GenerateStoryResult> {
  const channel: ContentChannel = input.channel ?? 'generic';
  const topic = input.topic.trim().slice(0, 500);
  const kit = await loadKit(ctx.brandId);

  const refund = await chargeOrThrow(ctx, 'text', POST_ROUTE);

  // 1. Texto corto: el mismo redactor que los posts.
  let text: GenerateTextResult;
  try {
    text = await generateContentText({
      channel,
      topic,
      language:  ctx.language,
      tone:      kit?.tone ?? [],
      brandName: kit?.name ?? undefined,
      tagline:   kit?.tagline ?? undefined,
      extraCtx:  kit?.industry ? `Industry: ${kit.industry}.` : undefined,
    });
  } catch (err) {
    await refund();
    reportError(err, { route: POST_ROUTE, auth: ctx.auth, service: 'ai', extra: { source: ctx.source } });
    const message = err instanceof Error ? err.message : 'Story text generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  // 2. Una imagen vertical (9:16). Es opcional en este flujo: si falla o no
  //    queda cuota, la story se guarda solo con texto.
  let imageUrl: string | null = null;
  let imageError: GenerateStoryResult['imageError'];
  if (input.withImage !== false) {
    const imageCredits = await consumeCredits(ctx.auth.orgId, ctx.auth.plan, 'image').catch(() => null);
    if (!imageCredits?.allowed) {
      imageError = 'credits_exhausted';
    } else {
      try {
        const img = await generateContentImage({
          prompt:  `Vertical story visual for: ${topic}. Eye-catching, mobile-first composition, no captions baked in.`,
          size:    '1024x1536',
          quality: 'medium',
          brand: {
            name:           kit?.name ?? undefined,
            primaryColor:   kit?.primary_color ?? undefined,
            secondaryColor: kit?.secondary_color ?? undefined,
            accentColor:    kit?.accent_color ?? undefined,
            tone:           kit?.tone ?? undefined,
          },
          referenceImages: input.referenceImageUrls?.slice(0, 3),
        });
        imageUrl = await uploadBase64Image(img.b64, ctx.auth.orgId, `story-${Date.now()}.jpeg`);
      } catch (err) {
        // La cuota se consumió: se devuelve, la imagen no llegó.
        await refundCredits(ctx.auth.orgId, 'image');
        reportError(err, { route: POST_ROUTE, auth: ctx.auth, service: 'ai', extra: { fase: 'imagen' } });
        imageError = 'failed';
      }
    }
  }

  const out: GenerateStoryResult = {
    body:       text.body,
    hashtags:   text.hashtags,
    image_url:  imageUrl,
    model:      text.model,
    tokensUsed: text.tokensUsed,
    ...(imageError ? { imageError } : {}),
  };
  if (input.save === false) return out;

  const db = createSupabaseServer();
  const { data: item, error } = await db
    .from('kefy_content_items')
    .insert({
      org_id:        ctx.auth.orgId,
      brand_id:      ctx.brandId || null,
      brand_kit_id:  kit?.id ?? null,
      created_by:    ctx.auth.userId,
      channel,
      content_type:  'story',
      body:          text.body,
      image_url:     imageUrl,
      hashtags:      text.hashtags,
      status:        'draft',
      render_status: 'not_rendered',
      metadata:      { model: text.model, created_via: createdVia(ctx) },
    })
    .select('id, content_type, channel, status, created_at')
    .single();

  if (error || !item) {
    reportError(new Error(error?.message ?? 'story insert returned no row'), {
      route: POST_ROUTE, service: 'supabase', auth: ctx.auth,
    });
    throw new ServiceError('unavailable', 500, 'Failed to save story').markReported();
  }

  return { itemId: (item as { id: string }).id, ...out };
}

// ─── writeStoryVideoScript ────────────────────────────────────────────────────

type StoryRow = {
  id: string;
  content_type: string;
  channel: string | null;
  body: string | null;
  title: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  brand_id: string | null;
};

/**
 * Escribe el guion de video (1–3 planos) de una story y lo guarda con sus
 * escenas en `slides`. La imagen de la story es el primer plano: no se paga
 * otra. Devuelve lo mismo que PATCH /api/content/story.
 */
export async function writeStoryVideoScript(
  ctx: ServiceContext,
  input: { itemId: string },
): Promise<{ itemId: string; scenes: ReturnType<typeof scriptToReelScenes>; script: Awaited<ReturnType<typeof generateVideoScript>>['script'] }> {
  const item = await loadOwnedItem<StoryRow>(
    ctx, input.itemId,
    'id, content_type, channel, body, title, image_url, metadata, brand_id',
    'Content item not found',
  );
  if (item.content_type !== 'story') {
    throw new ServiceError('invalid_input', 422, 'Only story items can generate a video script');
  }

  const kit = await loadKit(item.brand_id);

  const sourceRow = { ...item, content_type: 'story' as const };
  let topic = buildDerivedTopic(sourceRow);
  const imageForTopic = topicImageFor(sourceRow);
  if (!topic && !imageForTopic) {
    throw new ServiceError('invalid_input', 422, 'Story has no text or image to base the video on');
  }

  const refund = await chargeOrThrow(ctx, 'text', PATCH_ROUTE);

  // Una story que es solo una imagen: el tema sale de lo que muestra la imagen.
  if (!topic && imageForTopic) {
    try {
      topic = await describeImageAsTopic(imageForTopic, ctx.language);
    } catch (err) {
      reportError(err, { route: PATCH_ROUTE, auth: ctx.auth, service: 'ai', extra: { itemId: item.id, fase: 'tema-imagen' } });
    }
    if (!topic) {
      await refund();
      throw new ServiceError('provider_error', 502, 'Could not read the story image to base the video on').markReported();
    }
  }

  let script;
  try {
    const storyCtx = 'This is a Story, not a full Reel: 1-3 shots, under 12 seconds in total, one clear message.';
    ({ script } = await generateVideoScript({
      channel:     (item.channel as ContentChannel) ?? 'generic',
      topic,
      scene_count: 2,
      language:    ctx.language,
      tone:        kit?.tone ?? [],
      brandName:   kit?.name ?? undefined,
      tagline:     kit?.tagline ?? undefined,
      brandBrief:  videoBrandBrief(kit as Parameters<typeof videoBrandBrief>[0], ctx.language),
      extraCtx:    storyCtx,
    }));
  } catch (err) {
    await refund();
    reportError(err, { route: PATCH_ROUTE, auth: ctx.auth, service: 'ai', extra: { itemId: item.id } });
    const message = err instanceof Error ? err.message : 'Story video script generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  // La imagen de la story es el primer plano: no se paga otra.
  const storyImage = typeof item.image_url === 'string' && item.image_url ? item.image_url : null;
  if (storyImage && script.scenes[0]) script.scenes[0].visual.image_url = storyImage;
  const scenes = scriptToReelScenes(script, storyImage ? { s1: storyImage } : {});

  // El item ya se cargó filtrando por org (y marca): basta su id.
  const { error } = await createSupabaseServer()
    .from('kefy_content_items')
    .update({
      slides:        scenes,
      render_status: 'not_rendered',
      metadata:      { ...(item.metadata ?? {}), video_script: script },
    })
    .eq('id', item.id);

  if (error) {
    reportError(new Error(error.message), { route: PATCH_ROUTE, service: 'supabase', auth: ctx.auth, extra: { itemId: item.id } });
    throw new ServiceError('unavailable', 500, 'Failed to save story video script').markReported();
  }

  return { itemId: item.id, scenes, script };
}
