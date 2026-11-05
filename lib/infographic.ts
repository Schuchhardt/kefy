// lib/infographic.ts
// Piezas puras de las infografías: imágenes que llevan el texto dentro de los
// píxeles. Ver docs/content-formats.md § 5.

import type { GenerateImageOptions, InfographicCopy } from '@/types/ai';

const HEADLINE_MAX = 80;
const LABEL_MAX    = 48;
const DETAIL_MAX   = 96;
const CLOSING_MAX  = 70;
const VISUAL_MAX   = 200;
const MAX_POINTS   = 5;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max).trim() : '';
}

/** Valida la respuesta del modelo. Sin titular o sin puntos no hay infografía. */
export function parseInfographicCopy(value: unknown, maxPoints = MAX_POINTS): InfographicCopy | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const headline = text(raw.headline, HEADLINE_MAX);
  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map((p) => {
      const point = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      return { label: text(point.label, LABEL_MAX), detail: text(point.detail, DETAIL_MAX) };
    })
    .filter((p) => p.label)
    .slice(0, maxPoints);

  if (!headline || points.length === 0) return null;
  return {
    headline,
    points,
    closing: text(raw.closing, CLOSING_MAX),
    visual:  text(raw.visual, VISUAL_MAX),
  };
}

// El modelo de imagen recibe el texto exacto entre comillas: lo pide la guía de
// OpenAI, y además separa lo que se imprime de lo que solo describe.
const quoted = (value: string) => `"${value.replace(/"/g, "'")}"`;

/** El bloque de texto exacto que se le pide imprimir al modelo de imagen. */
export function infographicBrief(copy: InfographicCopy): string {
  const lines = [`Headline: ${quoted(copy.headline)}`];
  copy.points.forEach((point, i) => {
    lines.push(`Point ${i + 1}: ${quoted(point.label)}`);
    if (point.detail) lines.push(`Point ${i + 1} supporting line: ${quoted(point.detail)}`);
  });
  if (copy.closing) lines.push(`Closing line: ${quoted(copy.closing)}`);
  if (copy.visual) lines.push('', `Visual direction (do not print): ${copy.visual}`);
  return lines.join('\n');
}

/** Una story se lee en segundos: entran menos puntos que en un post. */
export const STORY_MAX_POINTS = 3;

/**
 * Formas que no recortan el texto al publicar (`lib/image-fit.ts`). Un post va
 * cuadrado o 4:5: un 2:3 en Instagram pierde arriba y abajo —justo el titular— y
 * un apaisado se corta en TikTok. Una story también se genera en 4:5: es justo la
 * zona que su interfaz no tapa, y `extendToStoryCanvas` la lleva a 9:16.
 */
export function infographicSize(
  format: 'post' | 'story',
  size?: GenerateImageOptions['size'],
): '1024x1024' | '1024x1280' {
  if (format === 'story') return '1024x1280';
  return size === '1024x1024' || size === '1080x1080' ? '1024x1024' : '1024x1280';
}

/** La letra chica se deshace por debajo de `high` (guía de OpenAI). */
export const INFOGRAPHIC_QUALITY = 'high';
