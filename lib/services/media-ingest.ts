// ─── Importación de media externa ─────────────────────────────────────────────
//
// El contenido que llega por la API o por MCP puede traer URLs de imágenes o
// videos alojados en cualquier sitio. No se le pasan tal cual a Zernio: se
// descargan y se re-alojan en el Storage de Kefy (bucket kefy-content-media,
// el mismo que usa /api/content/upload-media), así lo que se publica es
// siempre un archivo nuestro que no puede cambiar ni desaparecer después.
//
// Descargar una URL que elige un tercero desde el servidor es un vector de
// SSRF. Por eso:
//   - solo https y sin credenciales en la URL;
//   - se resuelve el DNS y se rechaza si alguna IP es privada, de loopback,
//     link-local, reservada o multicast, o una IPv6 que embebe una IPv4
//     interna (isPrivateAddress);
//   - la conexión se hace a esas mismas IPs ya comprobadas (pinnedFetch): el
//     nombre no se vuelve a resolver, así que un DNS rebinding no llega a
//     una IP interna;
//   - sin redirecciones — una redirección podría apuntar a una IP interna
//     después de la comprobación, así que se rechaza;
//   - timeout de 15 s, lista cerrada de content-types y tope de bytes que se
//     aplica mientras se lee el stream (no se confía en Content-Length).

import { lookup } from 'node:dns/promises';
import { randomUUID } from 'node:crypto';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { isPrivateAddress } from '@/lib/assistant/url-allowlist';
import { pinnedFetch, toPinnedAddresses } from '@/lib/services/pinned-fetch';
import type { ServiceContext } from '@/lib/services/context';
import { ServiceError, msg } from '@/lib/services/errors';

const BUCKET = 'kefy-content-media';
const TIMEOUT_MS = 15_000;

const MAX_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

const ALLOWED_TYPES: Record<MediaKind, Record<string, string>> = {
  image: {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
  },
  video: {
    'video/mp4':       'mp4',
    'video/quicktime': 'mov',
    'video/webm':      'webm',
  },
};

export type MediaKind = 'image' | 'video';

function invalid(message: string): ServiceError {
  return new ServiceError('invalid_input', 422, message);
}

/** Lee el body con un tope de bytes; aborta la descarga en cuanto lo supera. */
async function readCapped(
  res: Response,
  maxBytes: number,
  controller: AbortController,
  tooLarge: () => ServiceError,
): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      controller.abort();
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * Descarga `url` y la sube a kefy-content-media/{orgId}/imports/. Devuelve la
 * URL pública del archivo re-alojado. Lanza ServiceError 422 si la URL o el
 * archivo no son aceptables.
 */
export async function ingestExternalMedia(
  ctx: ServiceContext,
  url: string,
  kind: MediaKind,
): Promise<string> {
  const lang = ctx.language;

  // 1. URL https sin credenciales.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid(msg(lang, 'URL de media inválida', 'Invalid media URL'));
  }
  if (parsed.protocol !== 'https:') {
    throw invalid(msg(lang, 'La URL de media debe ser https', 'Media URL must use https'));
  }
  if (parsed.username || parsed.password) {
    throw invalid(msg(lang, 'La URL de media no puede llevar credenciales', 'Media URL must not contain credentials'));
  }

  // 2. Ninguna de las IPs del host puede ser interna.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family?: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw invalid(msg(lang, 'No se pudo resolver el host de la media', 'Could not resolve the media host'));
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw invalid(msg(lang, 'El host de la media no está permitido', 'Media host is not allowed'));
  }

  // 3. Descarga a las IPs ya comprobadas, sin seguir redirecciones y con timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await pinnedFetch(parsed, toPinnedAddresses(addresses), controller.signal);
  } catch (err) {
    clearTimeout(timer);
    reportError(err, {
      route: 'lib/services/media-ingest', service: 'media-ingest', auth: ctx.auth,
      extra: { host, kind },
    });
    throw invalid(msg(lang, 'No se pudo descargar la media', 'Could not download the media'));
  }

  try {
    if (res.status >= 300 && res.status < 400) {
      throw invalid(msg(lang, 'No se permiten redirecciones en la URL de media', 'Redirects not allowed'));
    }
    if (!res.ok) {
      throw invalid(msg(
        lang,
        `No se pudo descargar la media (HTTP ${res.status})`,
        `Could not download the media (HTTP ${res.status})`,
      ));
    }

    // 4. Tipo de archivo.
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = ALLOWED_TYPES[kind][contentType];
    if (!ext) {
      throw invalid(msg(
        lang,
        `Tipo de ${kind === 'image' ? 'imagen' : 'video'} no permitido: ${contentType || 'desconocido'}`,
        `Unsupported ${kind} type: ${contentType || 'unknown'}`,
      ));
    }

    // 5. Tamaño, antes (si el servidor lo declara) y durante la lectura.
    const maxBytes = MAX_BYTES[kind];
    const mb = Math.round(maxBytes / (1024 * 1024));
    const tooLarge = () => invalid(msg(
      lang,
      `El archivo supera el máximo de ${mb} MB`,
      `File exceeds the ${mb} MB limit`,
    ));
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      controller.abort();
      throw tooLarge();
    }

    let buffer: Buffer;
    try {
      buffer = await readCapped(res, maxBytes, controller, tooLarge);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      reportError(err, {
        route: 'lib/services/media-ingest', service: 'media-ingest', auth: ctx.auth,
        extra: { host, kind },
      });
      throw invalid(msg(lang, 'No se pudo descargar la media', 'Could not download the media'));
    }
    if (buffer.byteLength === 0) {
      throw invalid(msg(lang, 'El archivo de media está vacío', 'The media file is empty'));
    }

    // 6. Subida al Storage de Kefy.
    const path = `${ctx.auth.orgId}/imports/${randomUUID()}.${ext}`;
    const db = createSupabaseServer();
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadError) {
      reportError(new Error(uploadError.message), {
        route: 'lib/services/media-ingest', service: 'supabase', auth: ctx.auth,
        extra: { kind },
      });
      throw new ServiceError(
        'unavailable', 503,
        msg(lang, 'No se pudo guardar la media. Reintenta.', 'Could not store the media. Try again.'),
      );
    }

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new ServiceError(
        'unavailable', 503,
        msg(lang, 'No se pudo guardar la media. Reintenta.', 'Could not store the media. Try again.'),
      );
    }
    return data.publicUrl;
  } finally {
    clearTimeout(timer);
  }
}
