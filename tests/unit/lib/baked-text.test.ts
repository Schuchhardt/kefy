import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import {
  FALLBACK_FONT_FAMILY,
  FONT_WEIGHTS,
  fontFileName,
  buildFontConfig,
  bundledFontsDir,
  downloadedFontsDir,
  ensureFontsConfigured,
  resetFontsConfiguredForTests,
} from '@/lib/fonts';
import {
  bakeTextIfSupported,
  bakeTextOnImage,
  canRenderBakedText,
  canRenderFamily,
  resetTextRenderingProbeForTests,
  wrapText,
} from '@/lib/image-processor';
import { safeBoxFor } from '@/lib/preview-layout';

// Regresión (producción): los slides de carrusel se publicaban con una fila de
// cuadraditos vacíos en lugar del texto. `compositeTextOnImage` pedía
// "Arial, Helvetica, system-ui, sans-serif" y en el runtime de Vercel no hay
// ninguna fuente instalada: librsvg dibujaba el glifo `.notdef` —un rectángulo—
// para cada carácter, sin lanzar ningún error ni dejar rastro en los logs.
//
// Ver: https://…/kefy-content-images/…rendition-carousel-slide-1….jpeg

const blank = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 60, b: 90 } } })
    .jpeg()
    .toBuffer();

describe('fuentes propias', () => {
  beforeEach(() => {
    resetFontsConfiguredForTests();
    resetTextRenderingProbeForTests();
  });

  it('la fuente por defecto viaja en el repo, no se espera del sistema', () => {
    for (const weight of FONT_WEIGHTS) {
      const full = path.join(bundledFontsDir(), fontFileName(FALLBACK_FONT_FAMILY, weight));
      expect(fs.existsSync(full), `falta ${full}`).toBe(true);
      expect(fs.statSync(full).size).toBeGreaterThan(10_000);
    }
  });

  it('ensureFontsConfigured deja FONTCONFIG_PATH apuntando a un fonts.conf válido', () => {
    const confDir = ensureFontsConfigured();
    expect(confDir).toBeTruthy();
    expect(process.env.FONTCONFIG_PATH).toBe(confDir);

    const conf = fs.readFileSync(path.join(confDir!, 'fonts.conf'), 'utf-8');
    expect(conf).toContain(bundledFontsDir());
    expect(conf).toContain(downloadedFontsDir());
    expect(conf).toContain(FALLBACK_FONT_FAMILY);
  });

  it('el fonts.conf declara antes los directorios propios que los del sistema', () => {
    const conf = buildFontConfig('/app/assets/fonts', '/tmp/kefy-fonts', '/tmp/cache');
    const own       = conf.indexOf('/app/assets/fonts');
    const downloads = conf.indexOf('/tmp/kefy-fonts');
    const system    = conf.indexOf('/usr/share/fonts');
    expect(own).toBeGreaterThan(-1);
    expect(own).toBeLessThan(downloads);
    expect(downloads).toBeLessThan(system);
  });

  it('la fuente por defecto viaja en el repo, así que no depende de la red', async () => {
    await expect(canRenderFamily(FALLBACK_FONT_FAMILY)).resolves.toBe(true);
  });

  it('es idempotente: no reescribe la config en cada llamada', () => {
    expect(ensureFontsConfigured()).toBe(ensureFontsConfigured());
  });
});

describe('detección de cuadraditos (.notdef)', () => {
  beforeEach(() => {
    resetFontsConfiguredForTests();
    resetTextRenderingProbeForTests();
  });

  // Si cada glifo es el mismo rectángulo vacío, dos cadenas del mismo largo
  // dan píxeles idénticos. Con una fuente real, una fila de «I» no se parece
  // en nada a una de «W»: eso es exactamente lo que comprueba la salvaguarda.
  it('canRenderBakedText detecta que hay glifos de verdad', async () => {
    await expect(canRenderBakedText()).resolves.toBe(true);
  });

  it('el texto quemado no es una fila de rectángulos iguales', async () => {
    const base = await blank(600, 600);
    const [narrow, wide] = await Promise.all([
      bakeTextOnImage(base, { title: 'IIIIIIIIII' }),
      bakeTextOnImage(base, { title: 'WWWWWWWWWW' }),
    ]);
    expect(narrow.equals(wide)).toBe(false);
  });

  it('escribe acentos y eñes sin caer en el glifo por defecto', async () => {
    const base = await blank(600, 600);
    const [conAcentos, sinAcentos] = await Promise.all([
      bakeTextOnImage(base, { title: 'Año español' }),
      bakeTextOnImage(base, { title: 'Ano espanol' }),
    ]);
    expect(conAcentos.equals(sinAcentos)).toBe(false);
  });
});

describe('bakeTextOnImage', () => {
  it('devuelve la imagen intacta cuando no hay texto que escribir', async () => {
    const base = await blank(400, 400);
    expect(await bakeTextOnImage(base, { title: '', body: '  ' })).toBe(base);
  });

  it('conserva las dimensiones del original', async () => {
    const out = await bakeTextOnImage(await blank(1080, 1350), { title: 'Hola', body: 'Mundo' });
    const meta = await sharp(out).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 1080, height: 1350 });
  });

  it('el texto queda dentro de la zona segura: en TikTok no invade la columna de acciones', async () => {
    const width = 1080, height = 1920;
    const base = await blank(width, height);
    const out  = await bakeTextOnImage(base, { title: 'Un titular largo que ocupa varias líneas', body: 'Con cuerpo', platform: 'tiktok', format: 'carousel' });

    const safe = safeBoxFor(width, height, 'tiktok', 'carousel');
    // Franja a la derecha de la zona segura (donde van like/comentarios/compartir):
    // ahí no puede haber caído ni un píxel de texto blanco.
    const railLeft = safe.x + safe.width + 4;
    const rail = await sharp(out)
      .extract({ left: railLeft, top: 0, width: width - railLeft, height })
      .raw()
      .toBuffer();

    const original = await sharp(base)
      .extract({ left: railLeft, top: 0, width: width - railLeft, height })
      .raw()
      .toBuffer();

    // El degradado sí oscurece esa franja, pero no puede haber texto: ningún
    // píxel se vuelve más claro que el fondo original.
    let brighter = 0;
    for (let i = 0; i < rail.length; i++) {
      if (rail[i] > original[i] + 12) brighter++;
    }
    expect(brighter).toBe(0);
  });

  it('un slide de Instagram sí usa el ancho que TikTok reserva para su interfaz', async () => {
    const base = await blank(1080, 1080);
    const [ig, tk] = await Promise.all([
      bakeTextOnImage(base, { title: 'Mismo titular exacto', platform: 'instagram', format: 'carousel' }),
      bakeTextOnImage(base, { title: 'Mismo titular exacto', platform: 'tiktok',    format: 'carousel' }),
    ]);
    expect(ig.equals(tk)).toBe(false);
  });
});

describe('bakeTextIfSupported', () => {
  beforeEach(() => resetTextRenderingProbeForTests());

  it('escribe el texto cuando el entorno sabe dibujar glifos', async () => {
    const base = await blank(500, 500);
    const out  = await bakeTextIfSupported(base, { title: 'Publicable' });
    expect(out.equals(base)).toBe(false);
  });

  it('ante un buffer ilegible devuelve la entrada en vez de romper la publicación', async () => {
    const broken = Buffer.from('no soy una imagen');
    expect(await bakeTextIfSupported(broken, { title: 'Hola' })).toBe(broken);
  });
});

describe('wrapText', () => {
  it('parte por palabras sin cortarlas', () => {
    expect(wrapText('uno dos tres cuatro', 9)).toEqual(['uno dos', 'tres', 'cuatro']);
  });

  it('una palabra más larga que la línea ocupa su propia línea', () => {
    expect(wrapText('supercalifragilistico ya', 8)).toEqual(['supercalifragilistico', 'ya']);
  });

  it('no entra en bucle con un ancho degenerado', () => {
    expect(wrapText('hola mundo', 0)).toEqual(['hola mundo']);
  });
});
