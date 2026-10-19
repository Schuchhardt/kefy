// ─── Servicio: generación de reels ────────────────────────────────────────────
//
// Lógica de POST /api/content/reel, extraída para seguir la regla de
// AGENTS.md: nada de lógica inline en la ruta. Antes vivía directo en el
// route handler (junto con /api/content/story), que es justo lo que este
// archivo corrige.
//
// Un reel es un guion de video plano a plano (lib/video/script.ts): aquí solo
// se escribe el guion; las imágenes, animaciones, voces y el montaje se
// producen después, con el plan y su costo a la vista (lib/services/video.ts).
//
// Soporta más de una variante por llamada (`variant_count`, hasta
// REEL_VARIANT_COUNT_MAX): cada variante corre su propio guion y
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
import { generateVideoScript } from '@/lib/ai';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow } from '@/lib/services/errors';
import { getBrandKitForBrand, brandPromptContext } from '@/lib/services/brand-kit';
import type { ContentChannel } from '@/types/ai';
import type { ReelScene } from '@/types/content';
import type { BrandKit } from '@/types/brand-kit';
import { scriptToReelScenes, type VideoScript } from '@/lib/video/script';
import { compileVideoPlan } from '@/lib/video/plan';
import { videoBrandBrief, type VideoBrandKit } from '@/lib/video/brand';
import { VIDEO_TOOLS } from '@/lib/video/tools';

const ROUTE = 'POST /api/content/reel';

export const REEL_SCENE_COUNT_MIN   = 3;
export const REEL_SCENE_COUNT_MAX   = 8;
export const REEL_VARIANT_COUNT_MIN = 1;
export const REEL_VARIANT_COUNT_MAX = 3;

const VALID_IMAGE_QUALITIES = new Set(['low', 'medium', 'high']);
type ImageQuality = 'low' | 'medium' | 'high';

type KitRow = VideoBrandKit & { id?: string | null };

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
  /** Guion completo: planos, voces, personajes y herramientas de cada plano. */
  script:        VideoScript;
  /** Créditos estimados para producir el video con la animación por defecto. */
  production_credits: number;
  /** Vista derivada del guion, en el formato de siempre (previews, editor). */
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
  kit:              KitRow | null;
  variantIndex:     number;
  variantCount:     number;
}

async function generateOneVariant(
  ctx: ServiceContext,
  opts: OneVariantOpts,
): Promise<{ script: VideoScript; scenes: ReelScene[]; hook: string; hashtags: string[]; model: string; tokensUsed: number }> {
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
    generated = await generateVideoScript({
      channel:     opts.channel,
      topic:       opts.topic,
      scene_count: opts.sceneCount,
      language:    ctx.language,
      tone:        promptCtx.tone,
      brandName:   promptCtx.brandName,
      tagline:     promptCtx.tagline,
      // El perfil completo de la marca (audiencia, diferenciales, contacto…)
      // o, sin Brand Kit, una guía de respaldo: lib/video/brand.ts.
      brandBrief:  videoBrandBrief(opts.kit, ctx.language),
      extraCtx:    variantHint.trim() || undefined,
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

  // Ya no se generan imágenes aquí: el guion se guarda con su plan de
  // producción (imágenes, animaciones, voces, lipsync) y el usuario lo ve con
  // su costo antes de producirlo (lib/services/video.ts). Generar 2–3
  // variantes cuesta un texto cada una, no 8 imágenes cada una.
  const { script } = generated;
  return {
    script,
    scenes:     scriptToReelScenes(script),
    hook:       script.hook,
    hashtags:   script.hashtags,
    model:      generated.model,
    tokensUsed: generated.tokensUsed,
  };
}

function estimateProductionCredits(script: VideoScript, kit: KitRow | null): number {
  return compileVideoPlan(script, {
    capabilities: { animation: VIDEO_TOOLS.animate_image.available(), lipsync: VIDEO_TOOLS.lip_sync.available() },
    brand: { name: kit?.name ?? undefined },
  }).credits;
}

/**
 * Genera 1–3 variantes de un reel y guarda cada una como su propio item
 * (content_type='reel'). Siempre persiste — ver nota de licencia arriba.
 */
export async function generateReel(ctx: ServiceContext, input: GenerateReelInput): Promise<GenerateReelOutput> {
  const channel      = input.channel ?? 'generic';
  const sceneCount   = Math.min(REEL_SCENE_COUNT_MAX, Math.max(REEL_SCENE_COUNT_MIN, Math.floor(input.scene_count ?? 5)));
  // Las opciones de imagen ya no se usan al escribir el guion: se guardan
  // para cuando se produzca el video.
  const videoOptions = {
    image_quality:        VALID_IMAGE_QUALITIES.has(input.image_quality ?? '') ? input.image_quality! : 'medium',
    reference_image_urls: input.reference_image_urls?.slice(0, 2) ?? [],
    generate_images:      input.generate_images !== false,
  };
  const variantCount = Math.min(
    REEL_VARIANT_COUNT_MAX,
    Math.max(REEL_VARIANT_COUNT_MIN, Math.floor(input.variant_count ?? 1)),
  );
  const topic = input.topic.trim().slice(0, 500);

  const db = createSupabaseServer();
  const { data: kit } = await getBrandKitForBrand(db, ctx.brandId);

  // En paralelo, no en serie: el total es ~lo que tarda la variante más
  // lenta, no la suma de todas.
  //
  // Si la variante 2 se queda sin crédito o choca con el rate limit, la 1 ya
  // generada y cobrada no se pierde — se devuelve sola en vez de fallar toda
  // la petición (mismo criterio que un carrusel al que se le acaban los
  // créditos a mitad de los slides). Solo la primera variante fallando es un
  // error duro, igual que antes de que existieran las variantes.
  const settled = await Promise.allSettled(
    Array.from({ length: variantCount }, (_, i) =>
      generateOneVariant(ctx, {
        channel, topic, sceneCount,
        kit: kit as KitRow | null, variantIndex: i + 1, variantCount,
      }),
    ),
  );

  if (settled[0]!.status === 'rejected') throw settled[0]!.reason;

  // originalIndex se conserva para el metadata (variant_index) — con
  // ejecución en paralelo una variante del medio puede fallar mientras las de
  // los costados terminan bien, y no se quiere que eso reordene la numeración.
  const generatedVariants: Array<{ originalIndex: number; script: VideoScript; scenes: ReelScene[]; hook: string; hashtags: string[]; model: string; tokensUsed: number }> =
    settled
      .map((r, originalIndex) => (r.status === 'fulfilled' ? { originalIndex, ...r.value } : null))
      .filter((v): v is NonNullable<typeof v> => v !== null);

  const variantGroupId = variantCount > 1 ? randomUUID() : null;

  const variants: ReelVariant[] = [];
  for (const generated of generatedVariants) {
    const i = generated.originalIndex;
    const { data: item, error: itemError } = await db
      .from('kefy_content_items')
      .insert({
        org_id:       ctx.auth.orgId,
        brand_id:     ctx.brandId || null,
        brand_kit_id: kit?.id ?? null,
        created_by:   ctx.auth.userId,
        channel,
        content_type: 'reel',
        title:        generated.script.title || generated.hook || generated.scenes[0]?.title || null,
        body:         generated.hook || null,
        image_url:    null,
        slides:       generated.scenes,
        hashtags:     generated.hashtags,
        status:       'draft',
        metadata: {
          scene_count:   generated.scenes.length,
          model:         generated.model,
          video_script:  generated.script,
          video_options: videoOptions,
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
      script:        generated.script,
      production_credits: estimateProductionCredits(generated.script, kit as KitRow | null),
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
