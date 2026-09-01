// ─── Saneamiento de eventos antes de enviarlos a Sentry ───────────────────────
// Kefy maneja cookies de sesión, claves de API de terceros y contraseñas en
// texto plano dentro de los cuerpos de request. Nada de eso puede salir del
// servidor. Este módulo es puro para poder testearlo sin levantar Sentry.

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/** Marcador que reemplaza cualquier valor sensible. */
export const REDACTED = '[redacted]';

/** Cabeceras que nunca se envían, sin importar su valor. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-zernio-signature',
  'stripe-signature',
  'x-api-key',
  'x-vercel-automation-bypass-secret',
]);

/**
 * Claves cuyo valor se redacta en cualquier objeto anidado (body, extra, tags).
 * Se comparan en minúsculas y por coincidencia parcial, así `newPassword`,
 * `password_hash` y `PASSWORD` caen todos bajo `password`.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'credential',
  'session',
  'signature',
  'refresh',
  'access_key',
  'private',
];

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

/**
 * Recorre una estructura y redacta los valores de las claves sensibles.
 * Preserva la forma del objeto para que el evento siga siendo útil al depurar:
 * se ve que el campo venía, pero no su contenido.
 */
export function scrubDeep(value: unknown, depth = 0): unknown {
  // Corte de profundidad: evita recursión infinita con referencias cíclicas.
  if (depth > 8) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : scrubDeep(v, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * Quita credenciales de una URL: query params sensibles y userinfo
 * (`https://user:pass@host`). Devuelve la entrada tal cual si no es una URL.
 */
export function scrubUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (isSensitiveKey(key)) parsed.searchParams.set(key, REDACTED);
  }

  return parsed.toString();
}

/**
 * `beforeSend` de Sentry: última barrera antes de que un evento salga del
 * proceso. Devuelve `null` para descartar el evento por completo.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  // Request: cabeceras, cookies, querystring y body.
  if (event.request) {
    if (event.request.headers) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        headers[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) || isSensitiveKey(k)
          ? REDACTED
          : v;
      }
      event.request.headers = headers;
    }

    // Las cookies de Kefy son la sesión entera — nunca se envían.
    if (event.request.cookies) event.request.cookies = { [REDACTED]: REDACTED };

    if (typeof event.request.url === 'string') {
      event.request.url = scrubUrl(event.request.url);
    }

    if (event.request.query_string && typeof event.request.query_string === 'object') {
      event.request.query_string = scrubDeep(event.request.query_string) as Record<string, string>;
    }

    if (event.request.data !== undefined) {
      event.request.data = scrubDeep(event.request.data);
    }
  }

  if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubDeep(event.contexts) as typeof event.contexts;

  // El usuario se identifica por id de org/usuario, nunca por email ni IP.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  // Los breadcrumbs de fetch/xhr arrastran URLs con tokens en el query string.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => {
      const next = { ...b };
      if (next.data) next.data = scrubDeep(next.data) as Record<string, unknown>;
      if (typeof next.data?.url === 'string') next.data.url = scrubUrl(next.data.url);
      return next;
    });
  }

  return event;
}

// ─── Ruido que no vale la pena reportar ───────────────────────────────────────
// Errores que no son fallos de Kefy: extensiones del navegador, cortes de red
// del usuario, navegaciones canceladas. Enviarlos ahoga las alertas reales.

const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Load failed/i,
  /AbortError/i,
  /The operation was aborted/i,
  /chrome-extension:/i,
  /moz-extension:/i,
  /safari-extension:/i,
  // Next.js aborta el render al redirigir o al devolver notFound(): es control
  // de flujo, no un error.
  /NEXT_REDIRECT/,
  /NEXT_NOT_FOUND/,
];

export function isIgnoredError(message: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((p) => p.test(message));
}
