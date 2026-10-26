// ─── Servicio: formatos alternativos (rendiciones) ────────────────────────────
//
// Lógica de GET/POST /api/content/[itemId]/renditions, compartida con la
// herramienta convert_content_format del asistente. Ver
// docs/content-formats.md.
//
// Una pieza se crea en un formato (sus propias columnas) y puede convertirse a
// los otros tres: cada conversión es una fila de kefy_content_renditions. La
// pieza original es la referencia: su texto completo, el de sus slides y sus
// imágenes (buildSourceContext).
//
// Gasta como cualquier generación (docs/beta-abierta.md): `text` por la
// llamada de texto (incluida, si hace falta, la lectura de la imagen) e
// `image` por cada imagen. En post/story la imagen es la pieza: sin créditos
// para ella no se convierte. En carrusel/reel las slides que no alcancen salen
// sin imagen, igual que al generar un carrusel. Un fallo nuestro no se cobra.
//
// El kit se lee por la marca de la pieza (getBrandKitForBrand): la ruta lo
// buscaba con `.eq('org_id').maybeSingle()`, que con varias marcas no devuelve
// nada.

import { createSupabaseServer } from '@/lib/supabase';
import {
  generateContentText,
  generateContentImage,
  generateCarouselSlides,
  generateReelScript,
  describeImageAsTopic,
} from '@/lib/ai';
import { uploadBase64Image } from '@/lib/storage';
import {
  buildDerivedImagePrompt,
  buildDerivedTopic,
  buildSourceContext,
  topicImageFor,
} from '@/lib/content-source';
import { reportError } from '@/lib/observability';
import { consumeCredits, refundCredits, creditsExhaustedBody, CREDIT_COSTS } from '@/lib/usage';
import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';
import type { BrandKit } from '@/types/brand-kit';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, chargeOrThrow, msg } from '@/lib/services/errors';
import { loadOwnedItem } from '@/lib/services/ownership';
import { getBrandKitForBrand } from '@/lib/services/brand-kit';

export const RENDITION_FORMATS = ['post', 'carousel', 'reel', 'story'] as const satisfies readonly ContentType[];
export type RenditionFormat = (typeof RENDITION_FORMATS)[number];

const ROUTE = 'POST /api/content/[itemId]/renditions';

/** Slides que genera la conversión a carrusel o reel (una imagen cada una). */
export const RENDITION_SLIDE_COUNT = 5;

/**
 * Créditos máximos de una conversión: texto + imágenes. En carrusel/reel es un
 * techo (las slides sin imagen prompt o sin crédito no cobran imagen).
 */
export function renditionCredits(format: RenditionFormat): number {
  const images = format === 'carousel' || format === 'reel' ? RENDITION_SLIDE_COUNT : 1;
  return CREDIT_COSTS.text + CREDIT_COSTS.image * images;
}

type ItemRow = {
  id:           string;
  brand_id:     string | null;
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

const ITEM_COLUMNS =
  'id, brand_id, content_type, channel, title, body, hashtags, image_url, slides, video_url, mux_playback_id, mux_asset_id, render_status';

/** Las columnas del propio item, presentadas como su rendición «primaria». */
function primaryRendition(item: ItemRow) {
  return {
    id:              item.id,           // el mismo id que el item: ES la rendición primaria
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

function loadItem(ctx: ServiceContext, itemId: string): Promise<ItemRow> {
  return loadOwnedItem<ItemRow>(ctx, itemId, ITEM_COLUMNS);
}

// ─── listRenditions ───────────────────────────────────────────────────────────

/**
 * Todos los formatos generados hasta ahora: el primario (las columnas del
 * item) y las rendiciones alternativas.
 */
export async function listRenditions(ctx: ServiceContext, itemId: string): Promise<Record<string, unknown>[]> {
  const item = await loadItem(ctx, itemId);
  const { data: rows } = await createSupabaseServer()
    .from('kefy_content_renditions')
    .select('*')
    .eq('content_item_id', item.id);

  const renditions: Record<string, unknown>[] = [primaryRendition(item)];
  for (const format of RENDITION_FORMATS) {
    if (format === item.content_type) continue; // ya cubierto por el primario
    const row = ((rows ?? []) as Array<Record<string, unknown>>).find((r) => r.format === format);
    if (row) renditions.push({ ...row, is_primary: false });
  }
  return renditions;
}

// ─── generateRendition ────────────────────────────────────────────────────────

/**
 * Genera (o devuelve, si ya está lista) la pieza en `format`. `created` es
 * false cuando no se generó nada: es el formato primario o ya existía.
 */
export async function generateRendition(
  ctx: ServiceContext,
  input: { itemId: string; format: RenditionFormat },
): Promise<{ rendition: Record<string, unknown>; created: boolean }> {
  const { format } = input;
  const lang = ctx.language;
  if (!RENDITION_FORMATS.includes(format)) {
    throw new ServiceError('invalid_input', 422, `format must be one of: ${RENDITION_FORMATS.join(', ')}`);
  }

  const item = await loadItem(ctx, input.itemId);
  const itemId = item.id;

  // Ya es el formato primario: no hay nada que generar.
  if (format === item.content_type) return { rendition: primaryRendition(item), created: false };

  const db = createSupabaseServer();

  // Ya generada y lista: se devuelve tal cual (idempotente).
  const { data: existing } = await db
    .from('kefy_content_renditions')
    .select('*')
    .eq('content_item_id', itemId)
    .eq('format', format)
    .maybeSingle();
  if ((existing as { status?: string } | null)?.status === 'ready') {
    return { rendition: existing as Record<string, unknown>, created: false };
  }

  const brandId = item.brand_id ?? ctx.brandId;
  const { data: kitData } = brandId ? await getBrandKitForBrand(db, brandId) : { data: null };
  const brandKit = (kitData ?? null) as Pick<
    BrandKit, 'name' | 'tagline' | 'tone' | 'industry' | 'primary_color' | 'secondary_color' | 'accent_color'
  > | null;

  const source = buildSourceContext(item);
  let topic = buildDerivedTopic(item);
  const imageForTopic = topicImageFor(item);
  if (!topic && !imageForTopic) {
    throw new ServiceError('invalid_input', 422, 'Item has no text or image to base a new format on');
  }

  const refundText = await chargeOrThrow(ctx, 'text', ROUTE);

  // Una pieza que es solo imagen (p. ej. una story subida a mano) se convierte
  // a partir de lo que muestra la imagen.
  if (!topic && imageForTopic) {
    try {
      topic = await describeImageAsTopic(imageForTopic);
    } catch (err) {
      reportError(err, { route: ROUTE, auth: ctx.auth, service: 'ai', extra: { itemId, fase: 'tema-imagen' } });
    }
    if (!topic) {
      await refundText();
      throw new ServiceError('provider_error', 502, 'Could not read the image to base a new format on').markReported();
    }
  }

  // Imágenes cobradas que todavía no se entregaron: si la conversión falla,
  // se devuelven todas.
  const orgId = ctx.auth.orgId;
  let pendingImageCharges = 0;
  const chargeImage = async (): Promise<boolean> => {
    const credits = await consumeCredits(orgId, ctx.auth.plan, 'image').catch(() => null);
    if (!credits?.allowed) return false;
    pendingImageCharges++;
    return true;
  };
  const imageDelivered = () => { pendingImageCharges--; };
  const refundAll = async () => {
    await refundText();
    for (; pendingImageCharges > 0; pendingImageCharges--) await refundCredits(orgId, 'image');
  };
  const refundImage = async () => { pendingImageCharges--; await refundCredits(orgId, 'image'); };

  // En post/story la imagen es la pieza: se cobra antes de generar nada.
  if (format === 'post' || format === 'story') {
    const credits = await consumeCredits(orgId, ctx.auth.plan, 'image').catch(() => null);
    if (!credits?.allowed) {
      await refundText();
      if (credits) {
        const body = creditsExhaustedBody(credits, lang);
        throw new ServiceError('credits_exhausted', 429, body.error, body);
      }
      throw new ServiceError('unavailable', 503, msg(lang,
        'No pudimos verificar tus créditos de IA. Reintenta en un momento.',
        'Could not verify your AI credits. Try again in a moment.'));
    }
    pendingImageCharges++;
  }

  const referenceImages = source.imageUrls ?? [];
  const brandName = brandKit?.name ?? undefined;
  const tagline   = brandKit?.tagline ?? undefined;
  const tone      = brandKit?.tone ?? [];
  const extraCtx  = brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined;
  const brand = {
    name:           brandName,
    primaryColor:   brandKit?.primary_color   ?? undefined,
    secondaryColor: brandKit?.secondary_color ?? undefined,
    accentColor:    brandKit?.accent_color    ?? undefined,
    tone,
  };
  const textCtx = { channel: item.channel, topic, language: lang, tone, brandName, tagline, extraCtx, source };

  try {
    let patch: Record<string, unknown>;

    if (format === 'post') {
      const text = await generateContentText(textCtx);
      const img  = await generateContentImage({
        prompt: buildDerivedImagePrompt(`${topic}. ${text.body.slice(0, 200)}`, source),
        size: '1024x1024', quality: 'medium', brand, referenceImages,
      });
      const imageUrl = await uploadBase64Image(img.b64, orgId, `rendition-post-${Date.now()}.jpeg`);
      imageDelivered();
      patch = { body: text.body, hashtags: text.hashtags, image_url: imageUrl, status: 'ready' };

    } else if (format === 'carousel') {
      const generated = await generateCarouselSlides({ ...textCtx, slide_count: RENDITION_SLIDE_COUNT });
      const slides = await Promise.all(generated.slides.map(async (slide) => {
        if (!slide.image_prompt) return { ...slide, image_url: null, text_baked: false };
        if (!(await chargeImage())) return { ...slide, image_url: null, text_baked: false };
        try {
          // La imagen se guarda LIMPIA: el título/cuerpo se dibujan como HTML
          // encima en la vista previa y se queman recién al publicar.
          const imgResult = await generateContentImage({
            prompt: buildDerivedImagePrompt(slide.image_prompt, source),
            size: '1024x1024', quality: 'medium', brand, referenceImages,
          });
          const imageUrl = await uploadBase64Image(imgResult.b64, orgId, `rendition-carousel-slide-${slide.slide_order}-${Date.now()}.jpeg`);
          imageDelivered();
          return { ...slide, image_url: imageUrl, text_baked: false };
        } catch {
          await refundImage();
          return { ...slide, image_url: null, text_baked: false };
        }
      }));
      patch = { body: generated.description, hashtags: generated.hashtags, slides, image_url: slides[0]?.image_url ?? null, status: 'ready' };

    } else if (format === 'reel') {
      const generated = await generateReelScript({ ...textCtx, scene_count: RENDITION_SLIDE_COUNT });
      const scenes = await Promise.all(generated.scenes.map(async (scene) => {
        if (!(await chargeImage())) return { ...scene, image_url: undefined, text_baked: false };
        try {
          const bgPrompt = `Background scene for a reel: ${scene.image_prompt}. NO text, NO words, NO letters, NO logos, NO watermarks. Pure cinematic background scene only.`;
          const imgResult = await generateContentImage({
            prompt: buildDerivedImagePrompt(bgPrompt, source),
            size: '1024x1792', quality: 'medium', brand, referenceImages,
          });
          const imageUrl = await uploadBase64Image(imgResult.b64, orgId, `rendition-reel-scene-${scene.scene_order}-${Date.now()}.jpeg`);
          imageDelivered();
          return { ...scene, image_url: imageUrl, text_baked: false };
        } catch {
          await refundImage();
          return { ...scene, image_url: undefined, text_baked: false };
        }
      }));
      patch = { body: generated.hook, hashtags: generated.hashtags, slides: scenes, image_url: scenes.find((s) => s.image_url)?.image_url ?? null, render_status: 'not_rendered', status: 'ready' };

    } else {
      // story
      const text = await generateContentText(textCtx);
      const img  = await generateContentImage({
        prompt: buildDerivedImagePrompt(`Vertical story visual for: ${topic}. Eye-catching, mobile-first composition, no captions baked in.`, source),
        size: '1024x1536', quality: 'medium', brand, referenceImages,
      });
      const imageUrl = await uploadBase64Image(img.b64, orgId, `rendition-story-${Date.now()}.jpeg`);
      imageDelivered();
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
      await refundAll();
      reportError(new Error(`rendition upsert error: ${upsertError?.message ?? 'no row'}`), {
        route: ROUTE, auth: ctx.auth, service: 'supabase', extra: { itemId, format },
      });
      throw new ServiceError('unavailable', 500, 'Failed to save rendition').markReported();
    }

    return { rendition: rendition as Record<string, unknown>, created: true };
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    const message = err instanceof Error ? err.message : `Failed to generate ${format} rendition`;
    await refundAll();
    reportError(err, { route: ROUTE, auth: ctx.auth, service: 'ai', extra: { itemId, format } });
    await db
      .from('kefy_content_renditions')
      .upsert(
        { content_item_id: itemId, format, status: 'error', error_message: message },
        { onConflict: 'content_item_id,format' },
      );
    throw new ServiceError('provider_error', 502, message).markReported();
  }
}
