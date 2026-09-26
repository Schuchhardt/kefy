// ─── Servicio: generación de reels ────────────────────────────────────────────
//
// Lógica de POST /api/content/reel, extraída para seguir la regla de
// AGENTS.md: nada de lógica inline en la ruta. Antes vivía directo en el
// route handler (junto con /api/content/story), que es justo lo que este
// archivo corrige.
//
// Soporta más de una variante por llamada (`variant_count`, hasta
// REEL_VARIANT_COUNT_MAX): cada variante corre su propio guion + imágenes y
// se guarda como su propio item de `kefy_content_items`, agrupadas por
// `metadata.variant_group_id` — así el usuario las compara desde la
// biblioteca en vez de un selector efímero que se pierde si cierra la
// pestaña.
//
// A diferencia de generateTextPost/generateCarousel, este servicio no acepta
// `save: false`: un reel siempre queda en la biblioteca. Nadie llamaba a ese
// escape (confirmado: la UI y las herramientas del asistente ya mandaban
// `save: true` para post/carousel/reel/story) y generar variantes que no se
// guardan no tendría forma de compararlas después.

import { randomUUID } from 'node:crypto';
import { createSupabaseServer } from '@/lib/supabase';
import { generateReelScript, generateContentImage } from '@/lib/ai';
import { consumeCredits, refundCredits } from '@/lib/usage';
import { uploadBase64Image } from '@/lib/storage';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow } from '@/lib/services/errors';
import { getBrandKitForBrand, brandPromptContext } from '@/lib/services/brand-kit';
import type { ContentChannel } from '@/types/ai';
import type { ReelScene } from '@/types/content';
import type { BrandKit } from '@/types/brand-kit';

const ROUTE = 'POST /api/content/reel';

export const REEL_SCENE_COUNT_MIN   = 3;
export const REEL_SCENE_COUNT_MAX   = 8;
export const REEL_VARIANT_COUNT_MIN = 1;
export const REEL_VARIANT_COUNT_MAX = 3;

const VALID_IMAGE_QUALITIES = new Set(['low', 'medium', 'high']);
type ImageQuality = 'low' | 'medium' | 'high';

type KitRow = {
  id?:              string | null;
  name?:            string | null;
  tagline?:         string | null;
  tone?:            string[] | null;
  industry?:        string | null;
  primary_color?:   string | null;
  secondary_color?: string | null;
  accent_color?:    string | null;
};

export interface GenerateReelInput {
  topic:                  string;
  channel?:               ContentChannel;
  scene_count?:           number;
  generate_images?:       boolean;
  image_quality?:         ImageQuality;
  reference_image_urls?:  string[];
  /** 1–3, por defecto 1. La página de creación pide 2 para dejar elegir. */
  variant_count?:         number;
}

export interface ReelVariant {
  itemId:        string;
  variant_index: number;
  scenes:        ReelScene[];
  hook:          string;
  hashtags:      string[];
  model:         string;
  tokensUsed:    number;
}

export interface GenerateReelOutput {
  /** Solo presente cuando se generó más de una variante. */
  variant_group_id?:        string;
  /** Lo que se pidió — puede ser mayor que variants.length si una variante
   *  posterior a la primera se quedó sin crédito/cuota a mitad de camino. */
  requested_variant_count:  number;
  variants:                 ReelVariant[];
}

interface OneVariantOpts {
  channel:          ContentChannel;
  topic:            string;
  sceneCount:       number;
  genImages:        boolean;
  imageQuality:     ImageQuality;
  referenceImages?: string[];
  kit:              KitRow | null;
  variantIndex:     number;
  variantCount:     number;
}

async function generateOneVariant(
  ctx: ServiceContext,
  opts: OneVariantOpts,
): Promise<{ scenes: ReelScene[]; hook: string; hashtags: string[]; model: string; tokensUsed: number }> {
  const promptCtx = brandPromptContext(opts.kit as Pick<BrandKit, 'name' | 'tagline' | 'tone' | 'industry'> | null);
  // Sin esto, dos variantes del mismo topic suelen salir como el mismo hook
  // reformulado — el pedido explícito de "otro ángulo" es lo que de verdad
  // las hace comparables.
  const variantHint = opts.variantCount > 1
    ? ` This is variant ${opts.variantIndex} of ${opts.variantCount}: make the hook, wording and visual angle meaningfully different from a typical/previous version — do not just rephrase the same idea.`
    : '';

  const refund = await chargeOrThrow(ctx, 'text', ROUTE);
  let generated;
  try {
    generated = await generateReelScript({
      channel:     opts.channel,
      topic:       opts.topic,
      scene_count: opts.sceneCount,
      language:    ctx.language,
      tone:        promptCtx.tone,
      brandName:   promptCtx.brandName,
      tagline:     promptCtx.tagline,
      extraCtx:    (`${promptCtx.extraCtx ?? ''}${variantHint}`).trim() || undefined,
    });
  } catch (err) {
    await refund();
    reportError(err, {
      route: ROUTE, auth: ctx.auth, service: 'ai',
      extra: { sceneCount: opts.sceneCount, variantIndex: opts.variantIndex },
    });
    const message = err instanceof Error ? err.message : 'Reel script generation failed';
    throw new ServiceError('provider_error', 502, message).markReported();
  }

  // Una imagen de fondo por escena: cada una consume cuota por separado. Sin
  // cuota, la escena se queda sin fondo generado y Remotion usa el gradiente
  // de marca — el reel sigue saliendo (mismo criterio que un carrusel).
  const scenes = await Promise.all(
    generated.scenes.map(async (scene) => {
      if (!opts.genImages) return { ...scene, image_url: undefined };

      const sceneCredits = await consumeCredits(ctx.auth.orgId, ctx.auth.plan, 'image').catch(() => null);
      if (!sceneCredits?.allowed) return { ...scene, image_url: undefined };

      try {
        // Sin logo: Remotion lo superpone, no puede venir quemado en el fondo.
        const bgPrompt = `Background scene for a reel: ${scene.image_prompt}. NO text, NO words, NO letters, NO logos, NO watermarks, NO signs with writing, NO UI overlays. Pure cinematic background scene only.`;
        const imgResult = await generateContentImage({
          prompt:  bgPrompt,
          size:    '1024x1792',
          quality: opts.imageQuality,
          brand: {
            name:           opts.kit?.name           ?? undefined,
            primaryColor:   opts.kit?.primary_color  ?? undefined,
            secondaryColor: opts.kit?.secondary_color ?? undefined,
            accentColor:    opts.kit?.accent_color   ?? undefined,
            tone:           opts.kit?.tone           ?? undefined,
          },
          referenceImages: opts.referenceImages,
        });
        const imageUrl = await uploadBase64Image(
          imgResult.b64, ctx.auth.orgId, `reel-scene-${scene.scene_order}-${Date.now()}.jpeg`,
        );
        return { ...scene, image_url: imageUrl };
      } catch (imgErr) {
        await refundCredits(ctx.auth.orgId, 'image');
        reportError(imgErr, {
          route: ROUTE, auth: ctx.auth, service: 'ai',
          extra: { escena: scene.scene_order, fase: 'imagen', variantIndex: opts.variantIndex },
        });
        return { ...scene, image_url: undefined };
      }
    }),
  );

  return {
    scenes, hook: generated.hook, hashtags: generated.hashtags,
    model: generated.model, tokensUsed: generated.tokensUsed,
  };
}

/**
 * Genera 1–3 variantes de un reel y guarda cada una como su propio item
 * (content_type='reel'). Siempre persiste — ver nota de licencia arriba.
 */
export async function generateReel(ctx: ServiceContext, input: GenerateReelInput): Promise<GenerateReelOutput> {
  const channel      = input.channel ?? 'generic';
  const sceneCount   = Math.min(REEL_SCENE_COUNT_MAX, Math.max(REEL_SCENE_COUNT_MIN, Math.floor(input.scene_count ?? 5)));
  const genImages    = input.generate_images !== false;
  const imageQuality = VALID_IMAGE_QUALITIES.has(input.image_quality ?? '') ? input.image_quality! : 'medium';
  const referenceImages = input.reference_image_urls?.slice(0, 3);
  const variantCount = Math.min(
    REEL_VARIANT_COUNT_MAX,
    Math.max(REEL_VARIANT_COUNT_MIN, Math.floor(input.variant_count ?? 1)),
  );
  const topic = input.topic.trim().slice(0, 500);

  const db = createSupabaseServer();
  const { data: kit } = await getBrandKitForBrand(db, ctx.brandId);

  // Secuencial a propósito: si la variante 2 se queda sin crédito o choca con
  // el rate limit a mitad de la tanda, la 1 ya generada y cobrada no se pierde
  // — se devuelve sola en vez de fallar toda la petición (mismo criterio que
  // un carrusel al que se le acaban los créditos a mitad de los slides). Solo
  // la primera variante fallando es un error duro, igual que antes de que
  // existieran las variantes.
  const generatedVariants: Array<{ scenes: ReelScene[]; hook: string; hashtags: string[]; model: string; tokensUsed: number }> = [];
  for (let i = 0; i < variantCount; i++) {
    try {
      const generated = await generateOneVariant(ctx, {
        channel, topic, sceneCount, genImages, imageQuality, referenceImages,
        kit: kit as KitRow | null, variantIndex: i + 1, variantCount,
      });
      generatedVariants.push(generated);
    } catch (err) {
      if (i === 0) throw err;
      break;
    }
  }

  const variantGroupId = variantCount > 1 ? randomUUID() : null;

  const variants: ReelVariant[] = [];
  for (const [i, generated] of generatedVariants.entries()) {
    const coverImage = generated.scenes.find((s) => s.image_url)?.image_url ?? null;
    const { data: item, error: itemError } = await db
      .from('kefy_content_items')
      .insert({
        org_id:       ctx.auth.orgId,
        brand_id:     ctx.brandId || null,
        brand_kit_id: kit?.id ?? null,
        created_by:   ctx.auth.userId,
        channel,
        content_type: 'reel',
        title:        generated.hook || generated.scenes[0]?.title || null,
        body:         generated.hook || null,
        image_url:    coverImage,
        slides:       generated.scenes,
        hashtags:     generated.hashtags,
        status:       'draft',
        metadata: {
          scene_count: generated.scenes.length,
          model:       generated.model,
          ...(variantGroupId
            ? { variant_group_id: variantGroupId, variant_index: i + 1, variant_count: variantCount }
            : {}),
        },
      })
      .select('id')
      .single();

    if (itemError || !item) {
      reportError(new Error(itemError?.message ?? 'insert failed'), {
        route: ROUTE, auth: ctx.auth, service: 'supabase', extra: { variantIndex: i + 1 },
      });
      throw new ServiceError('unavailable', 500, 'Failed to save reel').markReported();
    }

    variants.push({
      itemId:        item.id as string,
      variant_index: i + 1,
      scenes:        generated.scenes,
      hook:          generated.hook,
      hashtags:      generated.hashtags,
      model:         generated.model,
      tokensUsed:    generated.tokensUsed,
    });
  }

  return {
    ...(variantGroupId ? { variant_group_id: variantGroupId } : {}),
    requested_variant_count: variantCount,
    variants,
  };
}
