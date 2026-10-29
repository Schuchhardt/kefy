// ─── Logos e íconos de la marca: clasificación y recorte ─────────────────────
//
// Reglas puras (sin sharp ni servidor) que comparten la subida
// (lib/brand-logo-image.ts mide la imagen y llama a estas funciones) y el
// recorte de íconos en el navegador (BrandLogoLibrary), para que la selección
// que propone la pantalla sea la misma que usa el asistente sin rectángulo.
//
// No hay IA: se mira la forma del contenido sin márgenes y su luminosidad. Es
// una propuesta, la persona la puede corregir.

import type { LogoBackground, LogoVariant } from '@/types/brand-kit';

export const LOGO_VARIANTS: readonly LogoVariant[] = ['horizontal', 'vertical', 'square'];
export const LOGO_BACKGROUNDS: readonly LogoBackground[] = ['light', 'dark', 'any'];

/** Caja en píxeles de la imagen. */
export interface PixelBox { left: number; top: number; width: number; height: number }

/** Recorte en fracciones de la imagen (0–1), independiente de la resolución. */
export interface CropRect { x: number; y: number; width: number; height: number }

/** Proporción a partir de la cual el contenido deja de ser «cuadrado». */
const WIDE = 1.4;

/** Forma del contenido (sin márgenes): horizontal, vertical o cuadrada. */
export function variantFor(width: number, height: number): LogoVariant {
  if (width <= 0 || height <= 0) return 'square';
  const ratio = width / height;
  if (ratio >= WIDE) return 'horizontal';
  if (ratio <= 1 / WIDE) return 'vertical';
  return 'square';
}

/** Un contenido cuadrado es un ícono (isotipo); lo demás, un logo. */
export function assetTypeFor(variant: LogoVariant): 'logo' | 'icon' {
  return variant === 'square' ? 'icon' : 'logo';
}

/**
 * Fondo para el que está pensado el logo. Luminancias de 0 (negro) a 1 (blanco).
 * - Con transparencia: un logo claro va sobre fondo oscuro y al revés; uno de
 *   tonos medios sirve en los dos.
 * - Sin transparencia el archivo trae su fondo: es ese.
 */
export function backgroundFor(input: { hasAlpha: boolean; contentLuminance: number; edgeLuminance: number }): LogoBackground {
  if (input.hasAlpha) {
    if (input.contentLuminance >= 0.75) return 'dark';
    if (input.contentLuminance <= 0.4) return 'light';
    return 'any';
  }
  return input.edgeLuminance < 0.35 ? 'dark' : 'light';
}

/**
 * Recorte cuadrado propuesto para sacar un ícono de un logo. En un logo
 * horizontal el isotipo suele ir a la izquierda; en uno vertical, arriba; en
 * uno cuadrado se toma el centro. `box` es el contenido sin márgenes (si no se
 * conoce, la imagen entera).
 */
export function suggestIconCrop(imageWidth: number, imageHeight: number, box?: PixelBox | null): CropRect {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, width: 1, height: 1 };
  const b = box && box.width > 0 && box.height > 0 ? box : { left: 0, top: 0, width: imageWidth, height: imageHeight };
  const side = Math.min(b.width, b.height);
  const variant = variantFor(b.width, b.height);

  let left = b.left;
  let top = b.top;
  if (variant === 'square') {
    left = b.left + (b.width - side) / 2;
    top = b.top + (b.height - side) / 2;
  }

  return clampCrop({
    x: left / imageWidth,
    y: top / imageHeight,
    width: side / imageWidth,
    height: side / imageHeight,
  });
}

/** Mantiene el recorte dentro de la imagen sin cambiar su tamaño si cabe. */
export function clampCrop(rect: CropRect): CropRect {
  const width = Math.min(Math.max(rect.width, 0), 1);
  const height = Math.min(Math.max(rect.height, 0), 1);
  const x = Math.min(Math.max(rect.x, 0), 1 - width);
  const y = Math.min(Math.max(rect.y, 0), 1 - height);
  return { x, y, width, height };
}

/** Error legible o null. Las fracciones tienen que caer dentro de la imagen. */
export function validateCropRect(rect: unknown): string | null {
  if (!rect || typeof rect !== 'object') return 'crop must be an object with x, y, width and height';
  const r = rect as Record<string, unknown>;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof r[key] !== 'number' || !Number.isFinite(r[key])) return `crop.${key} must be a number between 0 and 1`;
  }
  const { x, y, width, height } = r as unknown as CropRect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return 'crop must have a positive size inside the image';
  // Margen para el redondeo del navegador.
  if (x + width > 1.001 || y + height > 1.001) return 'crop must stay inside the image (fractions from 0 to 1)';
  return null;
}
