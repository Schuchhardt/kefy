import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  DEFAULT_BRAND_FONT,
  GOOGLE_FONT_OPTIONS,
  brandFontStack,
  findGoogleFont,
  resolveBrandFontName,
} from '@/lib/google-fonts';
import {
  FALLBACK_FONT_FAMILY,
  FONT_WEIGHTS,
  bundledFontsDir,
  downloadedFontsDir,
  ensureBrandFont,
  fontFileName,
  googleFontCssUrl,
  isBundled,
  parseTtfUrls,
  resetFontsConfiguredForTests,
  resolveBakedFonts,
} from '@/lib/fonts';

// El texto que se escribe dentro de la imagen tiene que ir con la tipografía
// que la marca eligió en su Brand Kit (`font_heading` / `font_body`), no con
// una genérica: es parte de su identidad y es lo que se ve en la preview.
// Son Google Fonts, así que el servidor descarga el TTF —fontconfig no sabe
// leer woff2— y cae a la por defecto si no puede.

/** Familia del catálogo con la que se ejercita la ruta de descarga. */
const NOT_BUNDLED = 'Poppins';

const CSS_TTF = `@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/poppins/v24/regular.ttf) format('truetype');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/poppins/v24/bold.ttf) format('truetype');
}`;

describe('catálogo de Google Fonts', () => {
  it('la fuente por defecto está en el catálogo que ve el usuario', () => {
    expect(findGoogleFont(DEFAULT_BRAND_FONT)).toBeTruthy();
  });

  // Guardián: si alguien añade una fuente al catálogo y no corre
  // `node scripts/fetch-brand-fonts.mjs`, esta prueba lo caza. Si no, el fallo
  // aparecería en producción como una descarga lenta o como texto en Inter.
  it('TODAS las fuentes del catálogo viajan en el repo', () => {
    const faltan = GOOGLE_FONT_OPTIONS
      .filter((font) => !isBundled(font.value))
      .map((font) => font.value);
    expect(faltan, `corre: node scripts/fetch-brand-fonts.mjs — faltan: ${faltan.join(', ')}`).toEqual([]);
  });

  it('cada fuente trae los dos pesos y ninguno está vacío', () => {
    for (const font of GOOGLE_FONT_OPTIONS) {
      for (const weight of FONT_WEIGHTS) {
        const file = path.join(bundledFontsDir(), fontFileName(font.value, weight));
        expect(fs.existsSync(file), `falta ${file}`).toBe(true);
        expect(fs.statSync(file).size, file).toBeGreaterThan(10_000);
      }
    }
  });

  it('la por defecto es la de respaldo y está incluida', () => {
    expect(FALLBACK_FONT_FAMILY).toBe(DEFAULT_BRAND_FONT);
    expect(isBundled(DEFAULT_BRAND_FONT)).toBe(true);
  });

  // Lo que se gana al tenerlas en el repo: componer el texto no toca la red.
  it('ninguna fuente del catálogo sale a la red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const font of GOOGLE_FONT_OPTIONS) {
      await expect(ensureBrandFont(font.value), font.value).resolves.toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('respeta la fuente elegida por la marca', () => {
    expect(resolveBrandFontName('Poppins')).toBe('Poppins');
    expect(resolveBrandFontName('  Montserrat  ')).toBe('Montserrat');
  });

  it('sin fuente elegida usa la por defecto', () => {
    expect(resolveBrandFontName(null)).toBe(DEFAULT_BRAND_FONT);
    expect(resolveBrandFontName('')).toBe(DEFAULT_BRAND_FONT);
  });

  // `font_heading` también lo rellena /api/brand-kit/enrich-url a partir de la
  // web de la marca: puede traer una fuente de pago, una local o basura, y
  // pedírsela a Google devuelve un 400.
  it('descarta una fuente que no está en el catálogo', () => {
    expect(resolveBrandFontName('Helvetica Neue LT Pro')).toBe(DEFAULT_BRAND_FONT);
    expect(resolveBrandFontName('<script>')).toBe(DEFAULT_BRAND_FONT);
  });

  it('la pila CSS de la preview sale del mismo catálogo', () => {
    expect(brandFontStack('Playfair Display')).toBe('"Playfair Display", Georgia, serif');
    expect(brandFontStack('inexistente')).toBe(brandFontStack(DEFAULT_BRAND_FONT));
  });

  it('ninguna entrada del catálogo está duplicada', () => {
    const values = GOOGLE_FONT_OPTIONS.map((f) => f.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('descarga desde Google Fonts (red de seguridad)', () => {
  // Como ya viajan TODAS las del catálogo en el repo, para ejercitar la
  // descarga hay que simular que no están: `bundledFontsDir()` cuelga de
  // `process.cwd()`, así que se apunta a un directorio vacío.
  beforeEach(() => {
    resetFontsConfiguredForTests();
    fs.rmSync(downloadedFontsDir(), { recursive: true, force: true });
    const empty = path.join(downloadedFontsDir(), '..', 'kefy-sin-fuentes');
    fs.mkdirSync(path.join(empty, 'assets', 'fonts'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(empty);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pide TTF, no woff2: fontconfig no sabe leer woff2', () => {
    // El truco es el User-Agent antiguo; la URL pide los dos pesos que se usan.
    expect(googleFontCssUrl('Poppins')).toBe(
      'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700',
    );
    expect(googleFontCssUrl('DM Sans')).toContain('family=DM+Sans');
  });

  it('extrae las URLs de los TTF de la respuesta CSS', () => {
    expect(parseTtfUrls(CSS_TTF)).toEqual([
      'https://fonts.gstatic.com/s/poppins/v24/regular.ttf',
      'https://fonts.gstatic.com/s/poppins/v24/bold.ttf',
    ]);
  });

  it('ignora las respuestas woff2', () => {
    expect(parseTtfUrls("src: url(https://x/y.woff2) format('woff2');")).toEqual([]);
  });

  it('descarga los dos pesos y los deja donde fontconfig los ve', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (typeof url === 'string' && url.includes('googleapis')) {
        return { ok: true, text: async () => CSS_TTF } as Response;
      }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode('ttf').buffer } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureBrandFont(NOT_BUNDLED)).resolves.toBe(true);

    for (const weight of FONT_WEIGHTS) {
      expect(fs.existsSync(path.join(downloadedFontsDir(), fontFileName(NOT_BUNDLED, weight)))).toBe(true);
    }
    // El User-Agent antiguo es lo que hace que Google responda con TTF.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': expect.stringContaining('Mozilla/4.0') } });
  });

  it('no pide a Google una familia que no está en el catálogo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(ensureBrandFont('Helvetica Neue LT Pro')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('descarga cada familia una sola vez por proceso', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      typeof url === 'string' && url.includes('googleapis')
        ? { ok: true, text: async () => CSS_TTF } as Response
        : { ok: true, arrayBuffer: async () => new TextEncoder().encode('ttf').buffer } as Response
    ));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([ensureBrandFont(NOT_BUNDLED), ensureBrandFont(NOT_BUNDLED), ensureBrandFont(NOT_BUNDLED)]);
    const cssCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('googleapis'));
    expect(cssCalls).toHaveLength(1);
  });

  it('si Google no responde, no rompe: devuelve false y se usará la por defecto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    await expect(ensureBrandFont(NOT_BUNDLED)).resolves.toBe(false);
  });

  it('un 404 de Google tampoco rompe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(ensureBrandFont(NOT_BUNDLED)).resolves.toBe(false);
  });
});

describe('resolveBakedFonts', () => {
  beforeEach(() => {
    resetFontsConfiguredForTests();
    // También el caché en disco: una fuente ya descargada por otra prueba
    // haría pasar el caso de "la descarga falla" sin llegar a la red.
    fs.rmSync(downloadedFontsDir(), { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      typeof url === 'string' && url.includes('googleapis')
        ? { ok: true, text: async () => CSS_TTF } as Response
        : { ok: true, arrayBuffer: async () => new TextEncoder().encode('ttf').buffer } as Response
    )));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('usa la fuente de titulares para el título y la de cuerpo para el cuerpo', async () => {
    await expect(resolveBakedFonts({ heading: 'Poppins', body: 'Lato' }))
      .resolves.toEqual({ title: 'Poppins', body: 'Lato' });
  });

  it('sin fuente de cuerpo repite la de titulares en vez de mezclar identidades', async () => {
    await expect(resolveBakedFonts({ heading: 'Poppins' }))
      .resolves.toEqual({ title: 'Poppins', body: 'Poppins' });
  });

  it('sin Brand Kit usa la por defecto en ambas', async () => {
    await expect(resolveBakedFonts()).resolves.toEqual({
      title: DEFAULT_BRAND_FONT, body: DEFAULT_BRAND_FONT,
    });
  });

  it('si la fuente no está y la descarga falla, cae a la por defecto', async () => {
    // Sin las fuentes del repo y sin red: el único camino que queda es Inter.
    const empty = path.join(downloadedFontsDir(), '..', 'kefy-sin-fuentes');
    fs.mkdirSync(path.join(empty, 'assets', 'fonts'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(empty);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    await expect(resolveBakedFonts({ heading: 'Poppins', body: 'Lato' })).resolves.toEqual({
      title: DEFAULT_BRAND_FONT, body: DEFAULT_BRAND_FONT,
    });
  });
});
