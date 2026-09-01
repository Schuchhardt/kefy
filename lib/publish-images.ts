// lib/publish-images.ts
// Preparación de las imágenes en el momento de publicar.
//
// Es el otro extremo de la decisión que toma `lib/preview-layout.ts`: en la app
// el texto de un slide se dibuja como HTML encima de la imagen limpia, y acá
// —una sola vez, ya sabiendo a qué red va— se compone sobre los píxeles.
//
// Se hace así porque las redes no muestran texto propio sobre cada slide de un
// carrusel: lo único que viaja es la imagen. Pero quemarlo al *generar*
// obligaba a decidir la tipografía y la posición sin saber el destino, dejaba
// el texto imposible de editar y lo duplicaba en la vista previa.
//
// Los slides anteriores a este cambio ya traen el texto quemado y no llevan
// `text_baked`: se tratan como quemados para no escribirlo dos veces encima.

import { resizeForFormat, bakeTextIfSupported, compositeStoryText } from '@/lib/image-processor';
import { uploadBase64Image } from '@/lib/storage';
import type { BrandFonts } from '@/lib/fonts';
import type { ContentChannel } from '@/types/ai';
import type { CarouselSlide, ContentType } from '@/types/content';

/** ¿Hay que escribir el texto de este slide sobre la imagen? */
export function needsTextBake(slide: Pick<CarouselSlide, 'text_baked' | 'title' | 'body'>): boolean {
  if (slide.text_baked !== false) return false;         // ya quemado, o pieza antigua
  return Boolean((slide.title ?? '').trim() || (slide.body ?? '').trim());
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface PreparedImageDeps {
  orgId:  string;
  /** Prefijo del nombre del archivo subido ('publish' | 'schedule'). */
  prefix: string;
  /** Tipografías del Brand Kit, para escribir con la fuente de la marca. */
  brandFonts?: BrandFonts;
}

/**
 * Ajusta una imagen suelta (post/story) al formato de la red y, si es una story
 * en una red que no muestra el caption, le escribe el texto encima.
 *
 * Cualquier fallo devuelve la URL original: una imagen sin recortar se publica,
 * una publicación caída no.
 */
export async function prepareSingleImage(
  imageUrl:  string,
  buffer:    Buffer | null,
  platform:  ContentChannel,
  format:    ContentType,
  deps:      PreparedImageDeps,
  bakeStoryCaption?: string,
): Promise<string> {
  if (!buffer) return imageUrl;
  try {
    let out = await resizeForFormat(buffer, platform, format);
    if (bakeStoryCaption) {
      out = await compositeStoryText(out, bakeStoryCaption, platform, deps.brandFonts);
    }
    return await uploadBase64Image(
      out.toString('base64'),
      deps.orgId,
      `${deps.prefix}-${platform}-${Date.now()}.jpeg`,
    );
  } catch (err) {
    console.warn(`[${deps.prefix}] no se pudo preparar la imagen para ${platform}, se usa la original:`, err);
    return imageUrl;
  }
}

/**
 * Prepara los slides de un carrusel para una red concreta: recorta al formato
 * que acepta y escribe el título/cuerpo dentro de su zona segura.
 *
 * Devuelve las URLs en el mismo orden. Un slide que falle conserva su URL
 * original en lugar de desaparecer del carrusel.
 */
export async function prepareCarouselSlides(
  slides:   CarouselSlide[],
  platform: ContentChannel,
  deps:     PreparedImageDeps,
): Promise<string[]> {
  const prepared = await Promise.all(slides.map(async (slide) => {
    const url = slide.image_url;
    if (typeof url !== 'string' || !url) return null;

    const buffer = await download(url);
    if (!buffer) return url;

    try {
      let out = await resizeForFormat(buffer, platform, 'carousel');
      if (needsTextBake(slide)) {
        out = await bakeTextIfSupported(out, {
          title:      slide.title,
          body:       slide.body,
          platform,
          format:     'carousel',
          brandFonts: deps.brandFonts,
        });
      }
      return await uploadBase64Image(
        out.toString('base64'),
        deps.orgId,
        `${deps.prefix}-${platform}-slide-${slide.slide_order ?? 0}-${Date.now()}.jpeg`,
      );
    } catch (err) {
      console.warn(`[${deps.prefix}] slide ${slide.slide_order} no se pudo preparar para ${platform}:`, err);
      return url;
    }
  }));

  return prepared.filter((u): u is string => typeof u === 'string' && !!u);
}
