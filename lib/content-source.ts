// lib/content-source.ts
// Cómo se le describe al generador la pieza de la que se está partiendo.
//
// Al convertir un post en carrusel (o un carrusel en reel, o un reel en story…)
// el endpoint sólo pasaba `topic`: los primeros 500 caracteres del cuerpo,
// mezclados con el resto del prompt. El modelo lo leía como "escribe algo sobre
// esto" y devolvía una pieza nueva —otro ángulo, otras imágenes— que no tenía
// relación reconocible con el original.
//
// Acá se arma un bloque explícito con el contenido original completo (texto,
// slides, hashtags) y la instrucción de *adaptarlo*, no de reemplazarlo. Es un
// módulo puro para poder testear el prompt sin llamar a ningún modelo.

import type { SourceContentContext } from '@/types/ai';
import type { CarouselSlide, ContentType, ReelScene } from '@/types/content';

const SOURCE_BODY_MAX  = 2000;
const SOURCE_SLIDE_MAX = 12;

const FORMAT_LABEL: Record<ContentType, string> = {
  post:     'single-image feed post',
  carousel: 'multi-slide carousel',
  reel:     'short vertical video (reel)',
  story:    'ephemeral vertical story',
};

/** Instrucciones de adaptación para el system prompt. Vacío si no hay origen. */
export function buildSourceBlock(source?: SourceContentContext): string {
  if (!source) return '';

  const original = FORMAT_LABEL[source.format] ?? source.format;
  const parts: string[] = [
    `SOURCE CONTENT — you are ADAPTING an existing ${original} into a different format.`,
    'Keep the same core message, argument, facts, figures, examples and call to action.',
    'Do NOT invent a different topic or a different angle: the result must be recognisably the same piece, retold for the new format.',
  ];

  const title = source.title?.trim();
  if (title) parts.push(`ORIGINAL TITLE: ${title.slice(0, 200)}`);

  const body = source.body?.trim();
  if (body) {
    parts.push('ORIGINAL TEXT:');
    parts.push(body.slice(0, SOURCE_BODY_MAX));
  }

  const slideTexts = (source.slideTexts ?? []).map((t) => t.trim()).filter(Boolean).slice(0, SOURCE_SLIDE_MAX);
  if (slideTexts.length) {
    parts.push('ORIGINAL SLIDES/SCENES (in order):');
    parts.push(slideTexts.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  }

  if (source.hashtags?.length) {
    parts.push(`ORIGINAL HASHTAGS: ${source.hashtags.slice(0, 15).join(' ')}`);
  }

  return parts.join('\n');
}

/** Antepone el bloque de origen a un system prompt, sin duplicarlo. */
export function withSourceBlock(systemPrompt: string, source?: SourceContentContext): string {
  const block = buildSourceBlock(source);
  if (!block || systemPrompt.includes(block)) return systemPrompt;
  return `${block}\n\n${systemPrompt}`;
}

// ─── Construcción del contexto a partir de una pieza guardada ────────────────

/** Lo que hace falta de una fila de contenido para poder derivar otro formato. */
export interface SourceRow {
  content_type: ContentType;
  title?:       string | null;
  body?:        string | null;
  hashtags?:    string[] | null;
  slides?:      unknown;
  image_url?:   string | null;
}

function slideText(slide: CarouselSlide | ReelScene): string {
  return [slide.title, slide.body].map((t) => (t ?? '').trim()).filter(Boolean).join(' — ');
}

/** Imágenes que se le pasan al generador como referencia visual (máx. 3). */
export const MAX_REFERENCE_IMAGES = 3;

/**
 * Traduce la pieza guardada al contexto que consumen los generadores.
 *
 * Las imágenes salen en orden de utilidad: primero la portada del ítem y luego
 * las de sus slides, sin repetidos, porque `generateContentImage` sólo acepta
 * unas pocas referencias y la portada es la que define el estilo de la pieza.
 */
export function buildSourceContext(row: SourceRow): SourceContentContext {
  const slides = Array.isArray(row.slides) ? (row.slides as Array<CarouselSlide | ReelScene>) : [];

  const imageUrls: string[] = [];
  const pushImage = (url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url) && !imageUrls.includes(url)) {
      imageUrls.push(url);
    }
  };
  pushImage(row.image_url);
  for (const slide of slides) pushImage(slide?.image_url);

  return {
    format:     row.content_type,
    title:      row.title ?? null,
    body:       row.body ?? null,
    hashtags:   row.hashtags ?? [],
    slideTexts: slides.map(slideText).filter(Boolean),
    imageUrls:  imageUrls.slice(0, MAX_REFERENCE_IMAGES),
  };
}

/**
 * El "tema" que se le pasa al generador.
 *
 * Sigue existiendo porque los generadores lo piden, pero ya no es la única
 * fuente de verdad: el contenido completo viaja en el bloque de origen. Se
 * prioriza el título y, si no hay, la primera frase del cuerpo — suficiente
 * para encabezar la petición sin recortar información relevante.
 */
export function buildDerivedTopic(row: SourceRow, maxChars = 500): string {
  const title = row.title?.trim();
  const body  = row.body?.trim() ?? '';
  if (title) return title.slice(0, maxChars);

  const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? '';
  const topic = firstSentence.length >= 20 ? firstSentence : body;
  return topic.slice(0, maxChars);
}

/**
 * Prompt de imagen para una pieza derivada.
 *
 * Se le dice explícitamente que continúe el lenguaje visual del original: las
 * referencias van aparte (`referenceImages`), pero sin decírselo por texto el
 * modelo las usaba sólo como inspiración vaga.
 */
export function buildDerivedImagePrompt(basePrompt: string, source?: SourceContentContext): string {
  if (!source?.imageUrls?.length) return basePrompt;
  return `${basePrompt}\n\nVisual continuity: this image belongs to the same piece of content as the reference image(s) provided. Match their style, palette, lighting and subject matter so both read as part of one campaign.`;
}
