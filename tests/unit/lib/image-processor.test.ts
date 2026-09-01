import { describe, it, expect } from 'vitest';
import { aspectLimitsFor, planImageFit } from '@/lib/image-processor';

// Regresión (producción): al subir una foto SIN IA ya exportada para Instagram
// (1080×1350, 4:5) el publicador la recortaba al cuadrado canónico 1080×1080 y
// la imagen salía cortada. Ahora sólo se recorta cuando la relación de aspecto
// está fuera de lo que acepta la red, y se recorta al límite más cercano.

describe('planImageFit — post', () => {
  it('expone a la preview la tolerancia de aspecto del publicador', () => {
    const { max } = aspectLimitsFor('instagram');
    expect(1200 / 628).toBeLessThanOrEqual(max);
  });

  it('Instagram 1080x1350 (4:5): no recorta, mantiene la imagen tal cual', () => {
    const plan = planImageFit(1080, 1350, 'instagram', 'post');
    expect(plan).toEqual({ mode: 'contain', width: 1080, height: 1350 });
  });

  it('Instagram 1080x1080 (1:1): sigue aceptándose sin recorte', () => {
    const plan = planImageFit(1080, 1080, 'instagram', 'post');
    expect(plan).toEqual({ mode: 'contain', width: 1080, height: 1080 });
  });

  it('Instagram 1200x628 (1.91:1): landscape dentro del rango, sin recorte', () => {
    const plan = planImageFit(1200, 628, 'instagram', 'post');
    expect(plan.mode).toBe('contain');
    expect(plan.width / plan.height).toBeCloseTo(1200 / 628, 3);
  });

  it('Instagram 1080x1920 (9:16): fuera de rango → recorta al 4:5 más cercano', () => {
    const plan = planImageFit(1080, 1920, 'instagram', 'post');
    expect(plan.mode).toBe('cover');
    expect(plan.width / plan.height).toBeCloseTo(0.8, 3);
    // Conserva el ancho original: sólo se recorta arriba/abajo lo imprescindible.
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1350);
  });

  it('Instagram 3000x1000 (3:1): fuera de rango → recorta a 1.91:1', () => {
    const plan = planImageFit(3000, 1000, 'instagram', 'post');
    expect(plan.mode).toBe('cover');
    expect(plan.width / plan.height).toBeCloseTo(1.91, 2);
  });

  it('X/Twitter 1080x1350: dentro del rango de X, ya no se recorta a 16:9', () => {
    const plan = planImageFit(1080, 1350, 'twitter', 'post');
    expect(plan).toEqual({ mode: 'contain', width: 1080, height: 1350 });
  });

  it('X/Twitter 2400x800 (3:1): recorta al máximo 2:1 de X', () => {
    const plan = planImageFit(2400, 800, 'twitter', 'post');
    expect(plan.mode).toBe('cover');
    expect(plan.width / plan.height).toBeCloseTo(2, 2);
  });

  it('TikTok 1200x628: superficie vertical → recorta a 1:1 como máximo', () => {
    const plan = planImageFit(1200, 628, 'tiktok', 'post');
    expect(plan.mode).toBe('cover');
    expect(plan.width / plan.height).toBeCloseTo(1, 2);
  });

  it('imágenes enormes se reducen manteniendo la relación de aspecto', () => {
    const plan = planImageFit(4320, 5400, 'instagram', 'post');
    expect(plan.mode).toBe('contain');
    expect(plan.width).toBeLessThanOrEqual(1440);
    expect(plan.height).toBeLessThanOrEqual(1800);
    expect(plan.width / plan.height).toBeCloseTo(0.8, 3);
  });

  it('imágenes pequeñas no se amplían', () => {
    const plan = planImageFit(600, 750, 'instagram', 'post');
    expect(plan).toEqual({ mode: 'contain', width: 600, height: 750 });
  });

  it('canal desconocido cae en el perfil genérico permisivo', () => {
    const plan = planImageFit(1080, 1350, 'generic', 'post');
    expect(plan.mode).toBe('contain');
  });

  it('dimensiones ilegibles → recorte canónico de la plataforma', () => {
    expect(planImageFit(0, 0, 'instagram', 'post')).toEqual({ mode: 'cover', width: 1080, height: 1350 });
    expect(planImageFit(0, 0, 'twitter', 'post')).toEqual({ mode: 'cover', width: 1600, height: 900 });
  });
});

describe('planImageFit — carousel', () => {
  it('respeta el rango de la plataforma igual que un post', () => {
    expect(planImageFit(1080, 1350, 'instagram', 'carousel')).toEqual({ mode: 'contain', width: 1080, height: 1350 });
  });
});

describe('planImageFit — reel / story', () => {
  it('reel siempre 9:16 recortado, sea cual sea el origen', () => {
    expect(planImageFit(1080, 1350, 'instagram', 'reel')).toEqual({ mode: 'cover', width: 1080, height: 1920 });
  });

  it('story siempre 9:16 recortado, en cualquier plataforma', () => {
    expect(planImageFit(3000, 1000, 'twitter', 'story')).toEqual({ mode: 'cover', width: 1080, height: 1920 });
  });
});

// ─── Integración con sharp ───────────────────────────────────────────────────

describe('resizeForFormat (sharp real)', () => {
  async function makeJpeg(width: number, height: number) {
    const sharp = (await import('sharp')).default;
    return sharp({
      create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
    }).jpeg().toBuffer();
  }

  async function dims(buf: Buffer) {
    const sharp = (await import('sharp')).default;
    const m = await sharp(buf).metadata();
    return { width: m.width, height: m.height };
  }

  it('una foto 1080x1350 lista para Instagram sale intacta (no cuadrada)', async () => {
    const { resizeForFormat } = await import('@/lib/image-processor');
    const out = await resizeForFormat(await makeJpeg(1080, 1350), 'instagram', 'post');
    expect(await dims(out)).toEqual({ width: 1080, height: 1350 });
  });

  it('una foto vertical 9:16 se recorta a 4:5 para un post de Instagram', async () => {
    const { resizeForFormat } = await import('@/lib/image-processor');
    const out = await resizeForFormat(await makeJpeg(1080, 1920), 'instagram', 'post');
    expect(await dims(out)).toEqual({ width: 1080, height: 1350 });
  });

  it('una story sigue saliendo 1080x1920', async () => {
    const { resizeForFormat } = await import('@/lib/image-processor');
    const out = await resizeForFormat(await makeJpeg(1080, 1350), 'instagram', 'story');
    expect(await dims(out)).toEqual({ width: 1080, height: 1920 });
  });

  // Los routes de publicación/agenda envuelven la llamada en try/catch y caen a
  // la URL original, así que un buffer corrupto nunca tumba la publicación.
  it('un buffer ilegible falla de forma controlada', async () => {
    const { resizeForFormat } = await import('@/lib/image-processor');
    await expect(resizeForFormat(Buffer.from('no soy una imagen'), 'instagram', 'post')).rejects.toThrow();
  });
});
