/**
 * Fuente del service worker de Kefy.
 *
 * El script se sirve desde `/sw.js` (ver `app/sw.js/route.ts`) con la versión
 * del build incrustada. Como el contenido del archivo cambia en cada
 * despliegue, el navegador detecta el service worker como "nuevo", lo instala,
 * borra las caches de la versión anterior y toma el control de inmediato: el
 * usuario siempre termina con la última versión de la app.
 *
 * Estrategias:
 *  - Navegaciones (documentos HTML): network-first con fallback a cache y, si
 *    tampoco hay cache, una página offline mínima. Nunca se cachean páginas de
 *    `/dashboard` (contenido privado del usuario).
 *  - `/_next/static/**` (assets con hash, inmutables): cache-first.
 *  - Resto de assets same-origin (`/public`, `/_next/image`): stale-while-revalidate.
 *  - `/api/**`, peticiones RSC, no-GET y cross-origin: siempre a red, sin cache.
 *
 * El código del worker evita template literals a propósito: se inyecta dentro
 * de un template literal de TypeScript y `${...}` se interpolaría.
 */

export const CACHE_PREFIX = 'kefy';

/** Nombres de las caches usadas por una versión concreta del service worker. */
export function cacheNames(version: string) {
  return {
    static: CACHE_PREFIX + '-static-' + version,
    pages: CACHE_PREFIX + '-pages-' + version,
  };
}

export function buildServiceWorkerSource(version: string): string {
  const names = cacheNames(version);

  return `// Kefy service worker — generado en build time. No editar a mano.
// Fuente: lib/service-worker.ts
const VERSION = ${JSON.stringify(version)};
const STATIC_CACHE = ${JSON.stringify(names.static)};
const PAGES_CACHE = ${JSON.stringify(names.pages)};
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE];
const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX + '-')};

const OFFLINE_HTML =
  '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Kefy — sin conexion</title><style>' +
  'html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;' +
  'background:#08080A;color:#F0EFE8;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}' +
  'h1{font-size:20px;margin:0 0 8px}p{color:#6B6B78;margin:0 0 20px;font-size:14px}' +
  'button{background:#C6FF4B;color:#08080A;border:0;border-radius:999px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer}' +
  '</style></head><body><div><h1>Sin conexion</h1>' +
  '<p>No pudimos cargar Kefy. Revisa tu conexion e intenta de nuevo.</p>' +
  '<button onclick="location.reload()">Reintentar</button></div></body></html>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// El worker nuevo no espera a que se cierren las pestañas abiertas: se activa
// de inmediato para que el usuario reciba la version recien desplegada.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.indexOf(CACHE_PREFIX) === 0 && CURRENT_CACHES.indexOf(key) === -1)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : data && data.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
    return;
  }

  // Se invoca al cerrar sesion: borra cualquier pagina cacheada.
  if (type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key.indexOf(CACHE_PREFIX) === 0).map((key) => caches.delete(key))
        )
      )
    );
  }
});

function isImmutableAsset(url) {
  return url.pathname.indexOf('/_next/static/') === 0 || url.pathname.indexOf('/fonts/') === 0;
}

function isCacheableResponse(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic';
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;

  const response = await network;
  if (response) return response;
  throw new Error('offline');
}

async function networkFirst(request, cacheName, storeInCache) {
  try {
    const response = await fetch(request);
    if (storeInCache && isCacheableResponse(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // Solo gestionamos recursos propios.
  if (url.origin !== self.location.origin) return;

  // Nunca cachear: API, el propio worker, el manifest, ni los payloads RSC de
  // Next (traen HTML/datos ya renderizados que deben venir siempre frescos).
  if (
    url.pathname.indexOf('/api/') === 0 ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1'
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    // El HTML del dashboard es privado: se sirve desde red y no se guarda.
    const isPrivate = url.pathname.indexOf('/dashboard') !== -1;
    event.respondWith(
      networkFirst(request, PAGES_CACHE, !isPrivate).catch(() => offlineResponse())
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'style' || request.destination === 'script') {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
`;
}
