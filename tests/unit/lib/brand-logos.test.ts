// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  assetTypeFor, backgroundFor, clampCrop, suggestIconCrop, validateCropRect, variantFor,
} from '@/lib/brand-logos';
import { analyzeLogo, cropIcon, CropError } from '@/lib/brand-logo-image';

// Clasificación de logos e íconos al subirlos y recorte de un ícono desde un
// logo. Sin IA: forma del contenido sin márgenes y su luminosidad.

/** Lienzo w×h con un rectángulo de color en `box` (fondo transparente u opaco). */
async function png(
  w: number, h: number,
  box: { left: number; top: number; width: number; height: number },
  opts: { fill?: string; bg?: string } = {},
): Promise<Buffer> {
  const background = opts.bg ?? { r: 0, g: 0, b: 0, alpha: 0 };
  const rect = await sharp({ create: { width: box.width, height: box.height, channels: 4, background: opts.fill ?? '#1a1a1a' } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background } })
    .composite([{ input: rect, left: box.left, top: box.top }])
    .png()
    .toBuffer();
}

describe('reglas puras', () => {
  it('la forma sale de la proporción', () => {
    expect(variantFor(400, 100)).toBe('horizontal');
    expect(variantFor(100, 300)).toBe('vertical');
    expect(variantFor(120, 100)).toBe('square');
    expect(assetTypeFor('square')).toBe('icon');
    expect(assetTypeFor('horizontal')).toBe('logo');
  });

  it('el fondo: logo claro con transparencia → oscuro; sin transparencia, el del archivo', () => {
    expect(backgroundFor({ hasAlpha: true, contentLuminance: 0.95, edgeLuminance: 0 })).toBe('dark');
    expect(backgroundFor({ hasAlpha: true, contentLuminance: 0.1, edgeLuminance: 0 })).toBe('light');
    expect(backgroundFor({ hasAlpha: true, contentLuminance: 0.55, edgeLuminance: 0 })).toBe('any');
    expect(backgroundFor({ hasAlpha: false, contentLuminance: 1, edgeLuminance: 0.05 })).toBe('dark');
    expect(backgroundFor({ hasAlpha: false, contentLuminance: 0, edgeLuminance: 1 })).toBe('light');
  });

  it('propone el isotipo a la izquierda de un logo horizontal y el centro de uno cuadrado', () => {
    expect(suggestIconCrop(400, 100, { left: 20, top: 10, width: 360, height: 80 }))
      .toEqual({ x: 0.05, y: 0.1, width: 0.2, height: 0.8 });
    const c = suggestIconCrop(200, 200);
    expect(c).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('clampCrop no deja salir el recorte de la imagen', () => {
    expect(clampCrop({ x: 0.9, y: -0.2, width: 0.3, height: 0.3 })).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.3 });
  });

  it('validateCropRect rechaza recortes fuera de la imagen o sin tamaño', () => {
    expect(validateCropRect({ x: 0, y: 0, width: 0.5, height: 0.5 })).toBeNull();
    expect(validateCropRect({ x: 0.8, y: 0, width: 0.5, height: 0.5 })).toMatch(/inside/);
    expect(validateCropRect({ x: 0, y: 0, width: 0, height: 0.5 })).toMatch(/positive/);
    expect(validateCropRect({ x: '0', y: 0, width: 1, height: 1 })).toMatch(/crop.x/);
    expect(validateCropRect(null)).toMatch(/object/);
  });
});

describe('analyzeLogo', () => {
  it('un logo horizontal oscuro con márgenes transparentes: logo, horizontal, fondo claro', async () => {
    const a = await analyzeLogo(await png(800, 800, { left: 100, top: 350, width: 600, height: 100 }), 'image/png');
    expect(a).toMatchObject({ type: 'logo', variant: 'horizontal', background: 'light', hasAlpha: true, width: 800, height: 800 });
    expect(a!.box.left).toBeGreaterThanOrEqual(95);
    expect(a!.box.width).toBeGreaterThanOrEqual(590);
    expect(a!.box.width).toBeLessThanOrEqual(615);
  });

  it('un símbolo blanco cuadrado sobre transparente: ícono para fondo oscuro', async () => {
    const a = await analyzeLogo(await png(600, 300, { left: 200, top: 50, width: 200, height: 200 }, { fill: '#ffffff' }), 'image/png');
    expect(a).toMatchObject({ type: 'icon', variant: 'square', background: 'dark' });
  });

  it('un JPG con fondo negro: el fondo cuenta como el del archivo', async () => {
    const jpg = await sharp(await png(400, 900, { left: 100, top: 100, width: 200, height: 700 }, { fill: '#ffcc00', bg: '#000000' })).jpeg().toBuffer();
    expect(await analyzeLogo(jpg, 'image/jpeg')).toMatchObject({ variant: 'vertical', background: 'dark', hasAlpha: false });
  });

  it('un SVG se rasteriza y se mide', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect x="10" y="10" width="280" height="80" fill="#222"/></svg>');
    expect(await analyzeLogo(svg, 'image/svg+xml')).toMatchObject({ type: 'logo', variant: 'horizontal', width: 300, height: 100 });
  });

  it('lo que no es una imagen devuelve null', async () => {
    expect(await analyzeLogo(Buffer.from('no soy una imagen'), 'image/png')).toBeNull();
  });
});

describe('cropIcon', () => {
  it('recorta la región pedida y devuelve un PNG cuadrado', async () => {
    const logo = await png(1000, 200, { left: 0, top: 0, width: 200, height: 200 }, { fill: '#ff0000' });
    const out = await cropIcon(logo, 'image/png', { x: 0, y: 0, width: 0.2, height: 1 });
    const meta = await sharp(out.buffer).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 200, height: 200 });
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255]);
  });

  it('sin recorte usa el propuesto: el isotipo a la izquierda del contenido', async () => {
    const logo = await png(1000, 400, { left: 100, top: 100, width: 800, height: 200 });
    const out = await cropIcon(logo, 'image/png');
    expect(out.rect.x).toBeCloseTo(0.1, 1);
    expect(out.rect.width).toBeCloseTo(0.2, 1);
    expect((await sharp(out.buffer).metadata()).width).toBe(out.size);
  });

  it('un recorte no cuadrado se rellena con transparencia y un ícono grande se limita a 1024 px', async () => {
    const logo = await png(3000, 2000, { left: 50, top: 50, width: 2900, height: 1900 }, { fill: '#00ff00' });
    const out = await cropIcon(logo, 'image/png', { x: 0, y: 0, width: 1, height: 1 });
    expect(out.size).toBe(1024);
    const { data, info } = await sharp(out.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // esquina de relleno
    const mid = ((info.height / 2) * info.width + info.width / 2) * 4;
    expect(data[mid + 3]).toBe(255);
  });

  it('sin transparencia, el relleno es el color de fondo del logo', async () => {
    const logo = await png(400, 200, { left: 150, top: 50, width: 100, height: 100 }, { fill: '#ff0000', bg: '#0000ff' });
    const out = await cropIcon(logo, 'image/png', { x: 0, y: 0, width: 1, height: 1 });
    const { data } = await sharp(out.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 255, 255]);
  });

  it('un recorte de menos de 16 px se rechaza', async () => {
    const logo = await png(100, 100, { left: 0, top: 0, width: 100, height: 100 });
    await expect(cropIcon(logo, 'image/png', { x: 0, y: 0, width: 0.1, height: 0.1 })).rejects.toBeInstanceOf(CropError);
  });
});
