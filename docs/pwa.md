# PWA y versionado de cache

Kefy es una PWA instalable. El objetivo del diseño es simple: **quien entra a la
app siempre corre la última versión desplegada**, sin depender de que el usuario
haga hard refresh ni de que expire una cache.

## Piezas

| Archivo | Rol |
|---------|-----|
| `scripts/generate-build-id.mjs` | Genera la versión del build antes de compilar |
| `lib/generated/build-id.ts` | Archivo generado con la versión (ignorado por git) |
| `lib/app-version.ts` | Reexporta `APP_VERSION` para el resto de la app |
| `lib/service-worker.ts` | Genera el código del service worker con la versión incrustada |
| `app/sw.js/route.ts` | Sirve `/sw.js` con `Cache-Control: no-cache` y `Service-Worker-Allowed: /` |
| `app/api/version/route.ts` | Devuelve la versión que corre el servidor (público, sin cache) |
| `app/manifest.ts` | Web App Manifest en `/manifest.webmanifest` |
| `components/PwaUpdater.tsx` | Registra el worker, detecta versiones viejas y recarga |
| `app/layout.tsx` | Enlaza el manifest, `theme-color` y monta `PwaUpdater` |

## Versión del build

**Se genera sola en cada build y no depende de ninguna variable de entorno.** El
formato es `<commit>-<timestamp>`, por ejemplo `239ddfee-mti15ne6`; si el build no
tiene el repo git a mano (algunos proveedores no lo dejan), queda solo el
timestamp.

El commit sirve para saber qué código está desplegado; el timestamp garantiza que
**dos builds del mismo commit tengan versiones distintas**. Sin eso, un rollback o
un redeploy reusaría la versión anterior y el service worker no invalidaría su
cache.

### Por qué un archivo generado y no `next.config.ts`

`next.config.ts` **se evalúa más de una vez por build**, en contextos aislados: la
primera evaluación alimenta cosas como `generateBuildId` y la segunda el inlining
de `env`. Calcular ahí un timestamp deja distintos chunks del mismo build con
versiones distintas. `globalThis` no sirve como canal entre evaluaciones (Next
las corre en contextos aislados) y `process.env` sí funcionaría, pero es
exactamente la dependencia de variables de entorno que queremos evitar.

Por eso la versión la calcula `scripts/generate-build-id.mjs` **una sola vez,
antes de compilar**, y la escribe en `lib/generated/build-id.ts`. Al ser un módulo
normal se compila una vez y toda la app —cliente, servidor y service worker—
comparte exactamente el mismo valor.

El script corre solo, vía scripts de npm:

| Script | Cuándo |
|--------|--------|
| `prebuild` | antes de cada `npm run build` |
| `predev` | antes de `npm run dev` |
| `postinstall` | tras `npm install` / `npm ci`, para que lint, typecheck y tests tengan el archivo |

> `vercel.json` usa `buildCommand: npm run build` (no `next build`) justamente
> para que `prebuild` corra en cada despliegue.

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

## Notificaciones locales

Generar la versión carrusel/reel/story de una pieza tarda entre medio minuto y
un par de minutos. Con la app instalada, la gente se va a otra cosa mientras
tanto y al volver no sabía si estaba lista, si había fallado o si seguía.

**No se usa Web Push**, y no hace falta: la pestaña sigue viva con la petición en
curso, así que al resolverse se dispara una notificación local desde el propio
cliente (`lib/notify.ts`). Sin servidor de push, sin VAPID, sin suscripciones.

| Pieza | Rol |
|-------|-----|
| `lib/notify.ts` | Permiso, decisión de avisar y visualización |
| `lib/service-worker.ts` | `notificationclick`: enfoca la pestaña abierta |
| `components/dashboard/content/ScheduleModal.tsx` | Dispara el aviso al terminar |

Tres detalles que no son opcionales:

- **El permiso se pide dentro del click**, no al abrir el modal: iOS ignora la
  petición si no viene de un gesto del usuario.
- **Muestra el service worker**, no `new Notification()`: Android y la PWA
  instalada rechazan la vía directa. `notifyLocal()` intenta primero
  `registration.showNotification()` y sólo cae a la otra si no hay worker.
- **Sólo se avisa si el usuario no está mirando** (`shouldNotify()`): pestaña
  oculta o app en modo standalone. Con el modal delante, el resultado ya se ve.

En iOS las notificaciones sólo existen si la app está instalada en la pantalla
de inicio (16.4+); en un navegador normal `notifyLocal()` devuelve `false` sin
romper nada.
