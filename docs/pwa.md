# PWA y versionado de cache

Kefy es una PWA instalable. El objetivo del diseño es simple: **quien entra a la
app siempre corre la última versión desplegada**, sin depender de que el usuario
haga hard refresh ni de que expire una cache.

## Piezas

| Archivo | Rol |
|---------|-----|
| `lib/build-id.ts` | Genera la versión del build |
| `next.config.ts` | La expone como `NEXT_PUBLIC_APP_VERSION` y `generateBuildId` |
| `lib/app-version.ts` | Exporta `APP_VERSION` (la versión incrustada en el bundle) |
| `lib/service-worker.ts` | Genera el código del service worker con la versión incrustada |
| `app/sw.js/route.ts` | Sirve `/sw.js` con `Cache-Control: no-cache` y `Service-Worker-Allowed: /` |
| `app/api/version/route.ts` | Devuelve la versión que corre el servidor (público, sin cache) |
| `app/manifest.ts` | Web App Manifest en `/manifest.webmanifest` |
| `components/PwaUpdater.tsx` | Registra el worker, detecta versiones viejas y recarga |
| `app/layout.tsx` | Enlaza el manifest, `theme-color` y monta `PwaUpdater` |

## Versión del build

**Se genera sola en cada build. No hay nada que configurar ni actualizar al
desplegar.** El formato es `<commit>-<despliegue>`, por ejemplo `228ec7c1-mti0f4xj`:

| Parte | De dónde sale |
|-------|---------------|
| commit (8 chars) | `VERCEL_GIT_COMMIT_SHA` → `COMMIT_REF` (Netlify) → `GITHUB_SHA` → `git rev-parse HEAD` → `local` |
| despliegue (10 chars) | `VERCEL_DEPLOYMENT_ID` → `DEPLOY_ID` (Netlify) → `GITHUB_RUN_ID` → timestamp en base 36 |

El commit sirve para saber qué código está desplegado; la parte de despliegue
garantiza que **dos builds del mismo commit tengan versiones distintas**. Sin
eso, un rollback, un redeploy o un cambio de variables de entorno reusaría la
versión anterior y el service worker no invalidaría su cache.

### Consistencia entre procesos

Next lanza procesos worker durante el build que vuelven a cargar
`next.config.ts`. Si cada uno calculara su propio timestamp, distintos chunks
quedarían con versiones distintas. Por eso `next.config.ts` escribe el valor ya
resuelto en `process.env.NEXT_PUBLIC_APP_VERSION`: los workers heredan el env del
proceso padre y `resolveBuildId()` lo devuelve tal cual, así que todo el build
comparte una única versión. Esa misma variable sirve como override manual si
alguna vez hace falta fijar la versión a mano.

## Por qué se invalida la cache

El script de `/sw.js` lleva la versión incrustada, o sea que su contenido cambia
en cada despliegue. El navegador compara byte a byte el worker instalado contra
el del servidor: al ser distinto lo trata como uno nuevo, lo instala, y en
`activate` se borran todas las caches `kefy-*` que no correspondan a la versión
actual. Como el worker hace `skipWaiting()` + `clients.claim()`, toma el control
sin esperar a que se cierren las pestañas abiertas.

## Estrategias de cache

| Recurso | Estrategia |
|---------|-----------|
| Navegaciones (HTML) | Network-first, fallback a cache y luego a página offline |
| `/[lang]/dashboard/**` | Network-first **sin guardar** (HTML privado del usuario) |
| `/_next/static/**` | Cache-first (assets con hash, inmutables) |
| Imágenes, fuentes, CSS, JS same-origin | Stale-while-revalidate |
| `/api/**`, payloads RSC, `/sw.js`, manifest | Nunca se cachean |

Al cerrar sesión, `lib/auth-context.tsx` manda `CLEAR_CACHES` al worker para
borrar todo lo cacheado.

## Cómo se recarga al usuario

`PwaUpdater` corre solo en producción (en desarrollo desregistra cualquier worker
para no interferir con HMR) y actúa por dos vías:

1. **Service worker**: pide `registration.update()` al montar, al volver a la
   pestaña, al recuperar conexión y cada 30 minutos. Si se activa un worker de
   otra versión (`controllerchange` + `GET_VERSION`), recarga la pestaña.
2. **Chequeo de versión**: compara `APP_VERSION` contra `/api/version`. Cubre
   navegadores sin service worker y el HTML servido desde una cache intermedia.
   Recarga al entrar a la app; si el usuario ya estaba adentro, solo si la
   pestaña estuvo oculta más de 60 s, para no interrumpir una sesión activa.

Un flag en `sessionStorage` (`kefy:reloaded-for-version`) evita bucles de recarga
si el servidor sigue devolviendo una versión que no coincide.

## Iconos

`public/icon-maskable-{192,512}.png` se generaron a partir de
`android-chrome-512x512.png` sobre fondo `#08080A`, con el logo al 60 % para
respetar la zona segura de los iconos maskable de Android.
