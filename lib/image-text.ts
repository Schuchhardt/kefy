// lib/image-text.ts
// Cómo lleva el texto la imagen de un post o una story. Módulo puro: lo usan el
// servidor al publicar y la vista previa, y tienen que dar la misma respuesta.
// Ver docs/content-formats.md § 5.

/**
 * - `none`: imagen sin texto.
 * - `overlay`: imagen limpia; Kefy escribe el texto encima al publicar y se
 *   puede editar hasta entonces.
 * - `generated`: el texto ya está en los píxeles; no se escribe nada encima.
 */
export const IMAGE_TEXT_MODES = ['none', 'overlay', 'generated'] as const;
export type ImageTextMode = (typeof IMAGE_TEXT_MODES)[number];

export interface ImageOverlay {
  title: string;
  body:  string;
}

export const OVERLAY_TITLE_MAX = 80;
export const OVERLAY_BODY_MAX  = 160;

export function isImageTextMode(value: unknown): value is ImageTextMode {
  return IMAGE_TEXT_MODES.includes(value as ImageTextMode);
}

/** Los carruseles y reels llevan su texto por slide o por escena. */
export function supportsImageText(format: string): format is 'post' | 'story' {
  return format === 'post' || format === 'story';
}

/** Lo que ya hacía cada formato antes de que existiera la opción. */
export function defaultImageText(format: string): ImageTextMode {
  return format === 'story' ? 'overlay' : 'none';
}

export function readImageText(format: string, metadata: unknown): ImageTextMode {
  const value = (metadata as { image_text?: unknown } | null | undefined)?.image_text;
  return isImageTextMode(value) ? value : defaultImageText(format);
}

export function cleanImageOverlay(title: unknown, body: unknown): ImageOverlay {
  return {
    title: typeof title === 'string' ? title.trim().slice(0, OVERLAY_TITLE_MAX) : '',
    body:  typeof body === 'string' ? body.trim().slice(0, OVERLAY_BODY_MAX) : '',
  };
}

export function readImageOverlay(metadata: unknown): ImageOverlay {
  const overlay = (metadata as { image_overlay?: { title?: unknown; body?: unknown } } | null | undefined)?.image_overlay;
  return cleanImageOverlay(overlay?.title, overlay?.body);
}

/**
 * Qué escribir sobre la imagen al publicar: un texto propio, el caption de la
 * story (string, que se recorta a tres líneas) o nada.
 */
export function imageTextToBake(
  format: string,
  metadata: unknown,
  caption: string,
): ImageOverlay | string | undefined {
  if (!supportsImageText(format) || readImageText(format, metadata) !== 'overlay') return undefined;
  const overlay = readImageOverlay(metadata);
  if (overlay.title || overlay.body) return overlay;
  return format === 'story' ? caption : undefined;
}
