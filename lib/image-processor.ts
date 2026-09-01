import sharp from 'sharp';
import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';
import { planImageFit, type ImageFitPlan } from '@/lib/image-fit';
import { safeBoxFor } from '@/lib/preview-layout';
import {
  FALLBACK_FONT_FAMILY,
  ensureFontsConfigured,
  resolveBakedFonts,
  type BakedFonts,
  type BrandFonts,
} from '@/lib/fonts';

export { planImageFit, aspectLimitsFor } from '@/lib/image-fit';
export type { ImageFitPlan } from '@/lib/image-fit';

/**
 * Read the source dimensions as they will be *displayed*, i.e. after EXIF
 * orientation is applied. Phone photos are often stored landscape with an
 * orientation tag; ignoring it made us plan the crop against the wrong axis.
 * Returns zeroes when the buffer can't be parsed.
 */
async function readOrientedDims(input: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(input).metadata();
    const width  = meta.width  ?? 0;
    const height = meta.height ?? 0;
    // Orientations 5-8 mean the image is rotated 90°/270° on display.
    return (meta.orientation ?? 1) >= 5
      ? { width: height, height: width }
      : { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function applyPlan(input: Buffer, plan: ImageFitPlan, quality: number): Promise<Buffer> {
  const pipeline = sharp(input).rotate(); // .rotate() with no args = auto-orient from EXIF

  if (plan.mode === 'contain') {
    pipeline.resize(plan.width, plan.height, { fit: 'inside', withoutEnlargement: true });
  } else {
    pipeline.resize(plan.width, plan.height, { fit: 'cover', position: 'centre' });
  }

  return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
}

/**
 * Fit an image buffer for the given platform's feed post. Images already within
 * the platform's accepted aspect range are only downscaled — never cropped.
 * Returns a JPEG buffer.
 *
 * @param input    - Source image as Buffer (JPEG/PNG/WebP/etc.)
 * @param platform - Target social channel
 * @param quality  - JPEG quality 1-100 (default 88)
 */
export async function resizeForPlatform(
  input: Buffer,
  platform: ContentChannel,
  quality = 88,
): Promise<Buffer> {
  return resizeForFormat(input, platform, 'post', quality);
}

/**
 * Fit an image buffer for the given (platform, format) pair. Reel/Story formats
 * always use the vertical 9:16 crop; other formats keep the source aspect ratio
 * whenever the platform accepts it, and otherwise crop to the nearest accepted
 * ratio so as little as possible is cut off.
 */
export async function resizeForFormat(
  input: Buffer,
  platform: ContentChannel,
  format: ContentType,
  quality = 88,
): Promise<Buffer> {
  const { width, height } = await readOrientedDims(input);
  const plan = planImageFit(width, height, platform, format);
  return applyPlan(input, plan, quality);
}

/**
 * Resize an image for multiple platforms simultaneously.
 * Returns a map of platform → JPEG Buffer.
 */
export async function resizeForPlatforms(
  input: Buffer,
  platforms: ContentChannel[],
  quality = 88,
): Promise<Map<ContentChannel, Buffer>> {
  const entries = await Promise.all(
    platforms.map(async (p) => {
      const buf = await resizeForPlatform(input, p, quality);
      return [p, buf] as [ContentChannel, Buffer];
    }),
  );
  return new Map(entries);
}

/**
 * Convert a base64 JPEG/PNG string to a Buffer.
 */
export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Ancho medio de un glifo respecto del tamaño de fuente. Sirve para partir las
 * líneas sin medir con la tipografía real, que cambia según la marca. El valor
 * es conservador a propósito: mejor una línea de más que texto saliéndose de
 * la zona segura.
 */
const GLYPH_WIDTH_RATIO = { bold: 0.55, regular: 0.52 } as const;

export function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine < 1) return text ? [text] : [];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Texto quemado dentro de la imagen ───────────────────────────────────────

export interface BakeTextOptions {
  /** Titular del slide/escena. */
  title?:    string;
  /** Copy de apoyo bajo el titular. */
  body?:     string;
  /** Red destino: define qué zona de la imagen tapa la propia interfaz. */
  platform?: ContentChannel;
  /** Formato destino: define la zona segura junto con la plataforma. */
  format?:   ContentType;
  /** Tipografías del Brand Kit. Sin esto se escribe con la por defecto. */
  brandFonts?: BrandFonts;
  quality?:  number;
}

/**
 * Escribe título y cuerpo *dentro* de la imagen.
 *
 * Se usa al publicar, no al generar: en la app el texto va como overlay HTML
 * encima de la imagen limpia (así se puede editar y se ve nítido), y sólo en
 * el momento de publicar se queman los píxeles, porque las redes no muestran
 * texto propio sobre cada slide de un carrusel.
 *
 * El texto se ancla abajo **dentro de la zona segura** de la red: en TikTok,
 * por ejemplo, la columna de like/comentarios y la franja del @usuario tapan
 * el contenido, y antes el texto quedaba justo debajo de esos controles.
 */
export async function bakeTextOnImage(
  input: Buffer,
  opts:  BakeTextOptions,
): Promise<Buffer> {
  ensureFontsConfigured();

  const title = (opts.title ?? '').trim();
  const body  = (opts.body  ?? '').trim();
  if (!title && !body) return input;

  // La marca escribe con SU tipografía: se descarga de Google Fonts si hace
  // falta y se comprueba que fontconfig la resuelva antes de usarla.
  const fonts = await usableFonts(opts.brandFonts);

  const platform = opts.platform ?? 'generic';
  const format   = opts.format   ?? 'post';

  const metadata = await sharp(input).metadata();
  const w = metadata.width  ?? 1024;
  const h = metadata.height ?? 1024;

  const safe = safeBoxFor(w, h, platform, format);

  // Los tamaños escalan con el ancho de la *zona segura*, no del lienzo: en un
  // 9:16 de TikTok la columna útil es mucho más angosta y un cuerpo calculado
  // sobre el ancho total se desbordaba.
  const titleSize  = Math.max(14, Math.round(safe.width * 0.075));
  const bodySize   = Math.max(11, Math.round(safe.width * 0.047));
  const titleLineH = Math.round(titleSize * 1.28);
  const bodyLineH  = Math.round(bodySize  * 1.45);
  const blockGap   = Math.round(bodySize  * 0.7);
  const strokeW    = Math.max(2, Math.round(w * 0.003));

  const titleLines = title
    ? wrapText(title, Math.round(safe.width / (titleSize * GLYPH_WIDTH_RATIO.bold)))
    : [];
  const bodyLines = body
    ? wrapText(body, Math.round(safe.width / (bodySize * GLYPH_WIDTH_RATIO.regular)))
    : [];

  const textHeight =
    titleLines.length * titleLineH +
    (bodyLines.length > 0 ? blockGap + bodyLines.length * bodyLineH : 0);

  // Ancla inferior de la zona segura; si el bloque no cabe, se sube hasta el
  // borde superior de la zona en vez de desbordarse por arriba.
  const safeBottom  = safe.y + safe.height;
  const blockTop    = Math.max(safe.y, safeBottom - textHeight);
  const titleBaseY  = blockTop + titleSize;
  const bodyBaseY   = titleBaseY + (titleLines.length ? (titleLines.length - 1) * titleLineH + blockGap + bodyLineH : bodyLineH);

  const line = (text: string, x: number, y: number, size: number, weight: number, family: string, fill: string, stroke: number) =>
    `<text x="${x}" y="${y}" font-family="${escapeXml(family)}" font-size="${size}"` +
    ` font-weight="${weight}" fill="${fill}" paint-order="stroke" stroke="rgba(0,0,0,0.55)"` +
    ` stroke-width="${stroke}" stroke-linejoin="round">${escapeXml(text)}</text>`;

  const titleSvg = titleLines
    .map((t, i) => line(t, safe.x, titleBaseY + i * titleLineH, titleSize, 700, fonts.title, '#ffffff', strokeW))
    .join('\n');
  const bodySvg = bodyLines
    .map((t, i) => line(t, safe.x, bodyBaseY + i * bodyLineH, bodySize, 400, fonts.body, 'rgba(255,255,255,0.92)', Math.max(1, strokeW - 1)))
    .join('\n');

  // El degradado sí puede pasar de la zona segura: sólo oscurece el fondo.
  const scrimTop = Math.max(0, blockTop - Math.round(titleSize * 1.6));

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.78)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTop}" width="${w}" height="${h - scrimTop}" fill="url(#scrim)"/>
  ${titleSvg}
  ${bodySvg}
</svg>`;

  return sharp(input)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: opts.quality ?? 90 })
    .toBuffer();
}

// ─── Salvaguarda: nunca publicar cuadraditos ─────────────────────────────────

const familyProbes = new Map<string, Promise<boolean>>();

/**
 * ¿El entorno puede dibujar glifos de verdad?
 *
 * Cuando fontconfig no encuentra ninguna fuente, librsvg no falla: dibuja el
 * glifo `.notdef` — un rectángulo vacío — para *cada* carácter. Eso es lo que
 * llenó de cuadraditos los slides ya publicados, sin un solo error en los logs.
 *
 * La prueba se apoya en que, si todo son cuadraditos, dos cadenas del mismo
 * largo con letras distintas dan exactamente los mismos píxeles. Con una
 * fuente real, una fila de «I» y una de «W» no se parecen en nada.
 */
export function canRenderFamily(family: string): Promise<boolean> {
  let probe = familyProbes.get(family);
  if (!probe) {
    probe = (async () => {
      ensureFontsConfigured();
      const svg = (text: string) => Buffer.from(
        `<svg width="360" height="90" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="360" height="90" fill="#fff"/>` +
        `<text x="6" y="64" font-family="${escapeXml(family)}" font-size="52" fill="#000">${text}</text>` +
        `</svg>`,
      );
      try {
        const [narrow, wide] = await Promise.all([
          sharp(svg('IIIIII')).png().toBuffer(),
          sharp(svg('WWWWWW')).png().toBuffer(),
        ]);
        return !narrow.equals(wide);
      } catch {
        return false;
      }
    })();
    familyProbes.set(family, probe);
  }
  return probe;
}

/** ¿Se puede escribir con la fuente por defecto? */
export function canRenderBakedText(): Promise<boolean> {
  return canRenderFamily(FALLBACK_FONT_FAMILY);
}

/**
 * Familias realmente utilizables para esta marca.
 *
 * `resolveBakedFonts` ya descarga lo que falta, pero fontconfig inicializa su
 * índice una vez por proceso: una fuente descargada *después* de ese momento
 * puede no llegar a verse en esa invocación. Por eso se comprueba cada familia
 * antes de usarla y se cae a la por defecto en vez de arriesgar cuadraditos.
 */
async function usableFonts(brand?: BrandFonts): Promise<BakedFonts> {
  const wanted = await resolveBakedFonts(brand);
  const [titleOk, bodyOk] = await Promise.all([
    canRenderFamily(wanted.title),
    canRenderFamily(wanted.body),
  ]);
  if (!titleOk) console.warn(`[image-processor] "${wanted.title}" no resuelve; se usa ${FALLBACK_FONT_FAMILY}`);
  return {
    title: titleOk ? wanted.title : FALLBACK_FONT_FAMILY,
    body:  bodyOk  ? wanted.body  : FALLBACK_FONT_FAMILY,
  };
}

/** Solo para tests: fuerza a repetir las comprobaciones. */
export function resetTextRenderingProbeForTests(): void {
  familyProbes.clear();
}

/**
 * Quema el texto sólo si el entorno sabe dibujarlo. Si no, devuelve la imagen
 * intacta: publicar la foto limpia es infinitamente mejor que publicarla con
 * una fila de cuadraditos encima, y el texto igual viaja en el caption.
 */
export async function bakeTextIfSupported(
  input: Buffer,
  opts:  BakeTextOptions,
): Promise<Buffer> {
  if (!(await canRenderBakedText())) {
    console.warn('[image-processor] fuentes no disponibles: se publica la imagen sin texto quemado');
    return input;
  }
  try {
    return await bakeTextOnImage(input, opts);
  } catch (err) {
    console.warn('[image-processor] no se pudo quemar el texto:', err);
    return input;
  }
}

const STORY_CAPTION_MAX_CHARS = 150;

/**
 * Composite caption text onto a story image buffer.
 * Truncates to ~3 visible lines to match the in-app preview clamp.
 * Returns a JPEG buffer with text baked in.
 */
export async function compositeStoryText(
  imageBuffer: Buffer,
  caption: string,
  platform: ContentChannel = 'generic',
  brandFonts?: BrandFonts,
): Promise<Buffer> {
  let text = caption.trim();
  if (text.length > STORY_CAPTION_MAX_CHARS) {
    text = text.slice(0, STORY_CAPTION_MAX_CHARS - 1).trimEnd() + '…';
  }
  return bakeTextIfSupported(imageBuffer, { body: text, platform, format: 'story', brandFonts });
}
