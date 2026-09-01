// lib/fonts.ts
// Fuentes para el texto que se "quema" dentro de las imágenes (sharp + SVG).
//
// Por qué existe este archivo: sharp compone el texto vía librsvg/pango, que
// resuelve las familias tipográficas con **fontconfig**. En el runtime de
// Vercel (Amazon Linux) no hay ninguna fuente instalada, así que un
// `font-family="Arial, Helvetica, sans-serif"` no resolvía a nada y cada
// glifo se dibujaba como el glifo `.notdef`: los cuadraditos vacíos que
// aparecían encima de los slides del carrusel.
//
// Qué fuente se usa: la que la marca eligió en su Brand Kit (`font_heading`
// para los titulares, `font_body` para el cuerpo). Son Google Fonts del
// catálogo de `lib/google-fonts.ts`, así que se descarga el TTF y se registra
// en fontconfig. Si la marca no eligió ninguna —o la descarga falla— se usa
// Inter, que viaja en el repo y por tanto no depende de la red.
//
// OJO: los `.ttf` se leen del filesystem en runtime, así que tienen que viajar
// con la función serverless — ver `outputFileTracingIncludes` en `next.config.ts`.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_BRAND_FONT, findGoogleFont, resolveBrandFontName } from '@/lib/google-fonts';

/** Familia que se usa cuando no hay ninguna elegida o falla la descarga. */
export const FALLBACK_FONT_FAMILY = DEFAULT_BRAND_FONT;

/** Los archivos que viajan en el repo. Deben cubrir la fuente por defecto. */
export const BUNDLED_FONT_FILES = ['Inter-Regular.ttf', 'Inter-Bold.ttf'] as const;

/** Pesos que se descargan de cada fuente: normal para el cuerpo, bold para el titular. */
const WEIGHTS = [400, 700] as const;

/** Descargar una fuente no puede colgar una publicación. */
const DOWNLOAD_TIMEOUT_MS = 6_000;

/**
 * Google devuelve `woff2` a los navegadores modernos, y fontconfig NO sabe
 * leer woff2. Con un User-Agent antiguo la misma API responde con TTF y sin
 * partir la fuente por rangos unicode, que es justo lo que necesitamos.
 */
const LEGACY_UA = 'Mozilla/4.0';

/** Directorio con las fuentes que viajan en el repo. */
export function bundledFontsDir(): string {
  return path.join(process.cwd(), 'assets', 'fonts');
}

/** Directorio escribible donde se dejan las fuentes descargadas. */
export function downloadedFontsDir(): string {
  return path.join(os.tmpdir(), 'kefy-fonts');
}

/**
 * Contenido del `fonts.conf` que se le entrega a fontconfig.
 *
 * Se declaran el directorio propio y el de descargas **primero**, y luego los
 * de sistema: si el host sí tiene fuentes (macOS en desarrollo, runners de CI)
 * siguen disponibles como fallback, pero la resolución nunca depende de ello.
 */
export function buildFontConfig(fontsDir: string, downloadsDir: string, cacheDir: string): string {
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <dir>${downloadsDir}</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir>/System/Library/Fonts</dir>
  <cachedir>${cacheDir}</cachedir>
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>${FALLBACK_FONT_FAMILY}</string></edit>
  </match>
</fontconfig>
`;
}

let configuredPath: string | null = null;

/**
 * Deja fontconfig apuntando a las fuentes propias. Idempotente y barata: solo
 * escribe el `fonts.conf` la primera vez.
 *
 * Devuelve el `FONTCONFIG_PATH` aplicado, o `null` si no se pudo configurar
 * (en cuyo caso el llamador debe asumir que el texto quizá no renderice).
 */
export function ensureFontsConfigured(): string | null {
  if (configuredPath) return configuredPath;

  const fontsDir = bundledFontsDir();
  if (!fs.existsSync(fontsDir)) return null;

  // El único directorio con permiso de escritura en serverless es /tmp.
  const confDir      = path.join(os.tmpdir(), 'kefy-fontconfig');
  const cacheDir     = path.join(confDir, 'cache');
  const downloadsDir = downloadedFontsDir();

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(confDir, 'fonts.conf'),
      buildFontConfig(fontsDir, downloadsDir, cacheDir),
      'utf-8',
    );
  } catch {
    return null;
  }

  process.env.FONTCONFIG_PATH = confDir;
  configuredPath = confDir;
  return confDir;
}

// ─── Descarga de la fuente de la marca ───────────────────────────────────────

/** Nombre de archivo estable para una (familia, peso). */
export function fontFileName(family: string, weight: number): string {
  return `${family.replace(/[^A-Za-z0-9]+/g, '-')}-${weight}.ttf`;
}

/** URL de la hoja de estilos que lista los TTF de una familia. */
export function googleFontCssUrl(family: string): string {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${WEIGHTS.join(';')}`;
}

/** Extrae las URLs `.ttf` de la respuesta CSS, en el orden en que aparecen. */
export function parseTtfUrls(css: string): string[] {
  return [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]);
}

/** Familias ya resueltas en este proceso (o que ya se sabe que fallaron). */
const downloads = new Map<string, Promise<boolean>>();

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFamily(family: string): Promise<boolean> {
  const dir = downloadedFontsDir();

  // Ya descargada en un invocación anterior de esta misma lambda.
  const cached = WEIGHTS.every((w) => fs.existsSync(path.join(dir, fontFileName(family, w))));
  if (cached) return true;

  try {
    const res = await fetchWithTimeout(googleFontCssUrl(family), { 'User-Agent': LEGACY_UA });
    if (!res.ok) return false;

    const urls = parseTtfUrls(await res.text());
    if (urls.length === 0) return false;

    fs.mkdirSync(dir, { recursive: true });

    // Las URLs vienen en el mismo orden que los pesos pedidos. Si Google
    // devuelve menos caras de las pedidas (fuentes con un solo peso), se
    // reutiliza la última para los pesos que falten.
    await Promise.all(WEIGHTS.map(async (weight, i) => {
      const url = urls[i] ?? urls[urls.length - 1];
      const font = await fetchWithTimeout(url);
      if (!font.ok) throw new Error(`HTTP ${font.status}`);
      fs.writeFileSync(path.join(dir, fontFileName(family, weight)), Buffer.from(await font.arrayBuffer()));
    }));

    return true;
  } catch (err) {
    console.warn(`[fonts] no se pudo descargar "${family}" de Google Fonts:`, err);
    return false;
  }
}

/**
 * Se asegura de que la familia esté disponible para fontconfig.
 * Devuelve `false` si no se pudo (sin red, familia retirada del catálogo…),
 * y entonces el llamador debe usar `FALLBACK_FONT_FAMILY`.
 */
export function ensureBrandFont(family: string): Promise<boolean> {
  ensureFontsConfigured();

  // La por defecto viaja en el repo: nunca hay que ir a la red por ella.
  if (family === FALLBACK_FONT_FAMILY) return Promise.resolve(true);
  if (!findGoogleFont(family))         return Promise.resolve(false);

  let pending = downloads.get(family);
  if (!pending) {
    pending = downloadFamily(family);
    downloads.set(family, pending);
  }
  return pending;
}

// ─── Resolución para el compositor ───────────────────────────────────────────

/** Las familias con las que se escribe el texto dentro de la imagen. */
export interface BakedFonts {
  /** Titular del slide — `font_heading` del Brand Kit. */
  title: string;
  /** Copy de apoyo — `font_body`, o el mismo titular si no hay. */
  body:  string;
}

/** Tipografías del Brand Kit tal y como están guardadas. */
export interface BrandFonts {
  heading?: string | null;
  body?:    string | null;
}

/**
 * Traduce las tipografías del Brand Kit a familias listas para el SVG,
 * descargando lo que haga falta y cayendo a la por defecto cuando no se pueda.
 *
 * Nunca lanza: el peor caso es texto en Inter, que es infinitamente mejor que
 * una publicación caída (o que los cuadraditos de antes).
 */
export async function resolveBakedFonts(brand?: BrandFonts): Promise<BakedFonts> {
  const heading = resolveBrandFontName(brand?.heading);
  // Sin fuente de cuerpo propia se usa la de titulares: es la identidad de la
  // marca y mezclarla con otra cualquiera se ve peor que repetirla.
  const body    = resolveBrandFontName(brand?.body ?? brand?.heading);

  const [headingOk, bodyOk] = await Promise.all([
    ensureBrandFont(heading),
    ensureBrandFont(body),
  ]);

  return {
    title: headingOk ? heading : FALLBACK_FONT_FAMILY,
    body:  bodyOk    ? body    : FALLBACK_FONT_FAMILY,
  };
}

/** Solo para tests: olvida la configuración y las descargas cacheadas. */
export function resetFontsConfiguredForTests(): void {
  configuredPath = null;
  downloads.clear();
}
