// ─── Medir y recortar logos con sharp (solo servidor) ────────────────────────
//
// analyzeLogo: clasifica un logo o ícono recién subido (forma y fondo) para la
// biblioteca de la marca. cropIcon: saca un ícono cuadrado de un logo.
// Las reglas viven en lib/brand-logos.ts; aquí solo se leen los píxeles.
//
// Se mide sobre una copia de 256 px como máximo: sobra para saber dónde está
// el contenido y su color, y un SVG o un PNG enorme no cuestan nada.

import sharp from 'sharp';
import {
  assetTypeFor, backgroundFor, suggestIconCrop, variantFor,
  type CropRect, type PixelBox,
} from '@/lib/brand-logos';
import type { LogoBackground, LogoVariant } from '@/types/brand-kit';

const SAMPLE = 256;
/** Lado máximo del ícono que se guarda. */
const ICON_MAX = 1024;
/** Lado mínimo, en píxeles del original, de un recorte útil. */
const ICON_MIN = 16;

export interface LogoAnalysis {
  width: number;
  height: number;
  /** Contenido sin márgenes, en píxeles del original. */
  box: PixelBox;
  hasAlpha: boolean;
  variant: LogoVariant;
  background: LogoBackground;
  type: 'logo' | 'icon';
}

function isSvg(mimeType: string | null | undefined): boolean {
  return mimeType === 'image/svg+xml';
}

/** Densidad para rasterizar un SVG con el lado largo cerca de `target` px. */
function svgDensity(width: number, height: number, target: number): number {
  const long = Math.max(width, height, 1);
  return Math.min(600, Math.max(72, Math.ceil((72 * target) / long)));
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Mide forma y fondo. null si el archivo no se puede leer como imagen. */
export async function analyzeLogo(buffer: Buffer, mimeType?: string | null): Promise<LogoAnalysis | null> {
  try {
    const meta = await sharp(buffer).metadata();
    let width = meta.width ?? 0;
    let height = meta.height ?? 0;
    if ((meta.orientation ?? 1) >= 5) [width, height] = [height, width];
    if (!width || !height) return null;

    const { data, info } = await sharp(buffer, isSvg(mimeType) ? { density: svgDensity(width, height, SAMPLE) } : {})
      .rotate()
      .resize(SAMPLE, SAMPLE, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const px = (x: number, y: number) => (y * w + x) * 4;

    let hasAlpha = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) { hasAlpha = true; break; }
    }

    // Sin transparencia, el fondo es el color medio de las esquinas.
    const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
    const bg = [0, 1, 2].map((c) => corners.reduce((sum, i) => sum + data[i + c], 0) / corners.length);

    let minX = w, minY = h, maxX = -1, maxY = -1;
    let lumSum = 0, count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = px(x, y);
        const isContent = hasAlpha
          ? data[i + 3] > 32
          : Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 40;
        if (!isContent) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        lumSum += luminance(data[i], data[i + 1], data[i + 2]);
        count++;
      }
    }

    const scaleX = width / w;
    const scaleY = height / h;
    const box: PixelBox = count > 0
      ? {
          left: Math.floor(minX * scaleX),
          top: Math.floor(minY * scaleY),
          width: Math.max(1, Math.ceil((maxX - minX + 1) * scaleX)),
          height: Math.max(1, Math.ceil((maxY - minY + 1) * scaleY)),
        }
      : { left: 0, top: 0, width, height };

    const variant = variantFor(box.width, box.height);
    return {
      width,
      height,
      box,
      hasAlpha,
      variant,
      background: backgroundFor({
        hasAlpha,
        contentLuminance: count > 0 ? lumSum / count : 0.5,
        edgeLuminance: luminance(bg[0], bg[1], bg[2]),
      }),
      type: assetTypeFor(variant),
    };
  } catch {
    return null;
  }
}

export class CropError extends Error {}

/**
 * Recorta `rect` (fracciones de la imagen) y lo devuelve como PNG cuadrado de
 * hasta 1024 px. Si el recorte no es cuadrado se rellena: transparente si el
 * logo tiene transparencia y con su color de fondo si no. Sin `rect`, usa el
 * recorte propuesto (suggestIconCrop sobre el contenido sin márgenes).
 */
export async function cropIcon(
  buffer: Buffer,
  mimeType: string | null | undefined,
  rect?: CropRect | null,
): Promise<{ buffer: Buffer; size: number; rect: CropRect }> {
  const analysis = await analyzeLogo(buffer, mimeType);
  if (!analysis) throw new CropError('The image could not be read');

  const crop = rect ?? suggestIconCrop(analysis.width, analysis.height, analysis.box);

  // Un SVG se rasteriza a buena resolución antes de recortar.
  const base = await sharp(buffer, isSvg(mimeType) ? { density: svgDensity(analysis.width, analysis.height, 2048) } : {})
    .rotate()
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const W = base.info.width;
  const H = base.info.height;

  const left = Math.min(W - 1, Math.max(0, Math.round(crop.x * W)));
  const top = Math.min(H - 1, Math.max(0, Math.round(crop.y * H)));
  const width = Math.min(W - left, Math.max(1, Math.round(crop.width * W)));
  const height = Math.min(H - top, Math.max(1, Math.round(crop.height * H)));

  // El mínimo se mide en píxeles del archivo original, no del SVG rasterizado.
  const scale = analysis.width / W;
  if (width * scale < ICON_MIN || height * scale < ICON_MIN) {
    throw new CropError(`The crop is too small (minimum ${ICON_MIN} px)`);
  }

  const region = sharp(base.data).extract({ left, top, width, height });
  let background = { r: 0, g: 0, b: 0, alpha: 0 };
  if (!analysis.hasAlpha) {
    const { data } = await sharp(base.data).extract({ left, top, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
  }

  const size = Math.min(ICON_MAX, Math.max(width, height));
  const out = await region
    .resize(size, size, { fit: 'contain', background })
    .png()
    .toBuffer();

  return { buffer: out, size, rect: crop };
}
