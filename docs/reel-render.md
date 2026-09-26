# Render de reels / stories (Remotion Lambda)

Cómo se convierte un guion de escenas en un MP4 publicable, y por qué el estado
`rendering` necesita un reconciliador.

## Flujo

1. **`POST /api/content/reel/render`** (`{ itemId, format? }`)
   - `format` ausente → renderiza el ítem (`kefy_content_items`).
   - `format` distinto de su `content_type` → renderiza la rendición
     (`kefy_content_renditions`) de ese formato.
   - Escribe `render_status='rendering'` + `metadata.lambda_started_at`
     **antes** de disparar Lambda, dispara `renderMediaOnLambda` y luego guarda
     `metadata.lambda_render_id` / `lambda_bucket`. Responde `202`.
   - Si la fila ya está en `rendering`, **no** lanza un segundo render: reconcilia
     primero y solo re-dispara si el anterior está muerto.
2. **`GET /api/content/reel/render?itemId=&format=`** — polling del cliente
   (`MuxReelPlayer`). Delega en el reconciliador y persiste el resultado.
3. **`GET /api/content/reel/reconcile`** — cron cada 5 min (`vercel.json`,
   header `Authorization: Bearer ${CRON_SECRET}`). Barre hasta 25 filas en
   `rendering` y las cierra. También acepta `POST` de un owner/admin para barrer
   solo su organización.

El MP4 queda en el bucket S3 de Remotion y su URL pública se guarda en
`video_url`. `mux_playback_id` es el pipeline legacy: esos ítems **no son
publicables** y hay que re-renderizarlos (ver `docs/zernio.md`).

## Por qué existe el reconciliador

`video_url` solo se escribía cuando el navegador poleaba el GET. Si el usuario
cerraba la pestaña a mitad del render, Lambda terminaba, el MP4 quedaba en S3 y
la fila se quedaba en `rendering` con `video_url=null` **para siempre** — y el
cliente nunca re-dispara un render sobre una fila que dice estar renderizando.
Ese reel quedaba inpublicable (y antes se publicaba como imagen de portada).

`lib/reel-render.ts::reconcileRenderTarget` decide el estado real y solo mueve
filas *fuera* de `rendering`:

| Situación | Resultado |
|---|---|
| `video_url` ya presente | `ready` |
| Lambda terminó (`done` + `outputFile`) | `ready` + guarda `video_url` |
| Error fatal de Lambda | `not_rendered` + mensaje de error |
| Sin `lambda_render_id`, < 3 min desde el inicio | sigue `rendering` (el POST aún puede estar escribiendo el metadata) |
| Sin `lambda_render_id`, > 3 min (`RENDER_TRIGGER_GRACE_MS`) | `not_rendered` (`trigger_lost`) |
| Renderizando > 20 min (`RENDER_STALE_MS`) | `not_rendered` (`stale`) |
| Lambda/S3 no responde | sigue `rendering` hasta pasar el límite de antigüedad |

Al liberar una fila se borran `lambda_render_id` / `lambda_bucket` /
`lambda_started_at` para que el siguiente render arranque limpio. `MuxReelPlayer`
reacciona a `render_status: 'not_rendered'` re-disparando el render **una sola
vez** (evita bucles si el render falla siempre).

## Duración del video

La duración sale de las escenas reales vía `calculateMetadata`
(`remotion/Root.tsx` → `calculateReelMetadata`). El `durationInFrames` del
`<Composition>` es solo el default de Remotion Studio.

Antes no había `calculateMetadata`, así que **todo render duraba 17 s** (las
escenas de ejemplo): los guiones de más de 17 s se cortaban a mitad de escena y
los de menos terminaban con segundos de fondo muerto. La IA genera 3–8 escenas de
2–5 s → entre 6 y 40 s reales.

## Transiciones: crossfade, no corte a negro

Cada escena solía hacer fade a negro y la siguiente fade desde negro — un corte
limpio, pero se sentía como una presentación de slides, no una pieza continua.
Ahora la escena N+1 arranca `OVERLAP_FRAMES` (15 frames, ~0.5s) antes del límite
nominal de la escena N y se funde encima de ella (que sigue reproduciéndose
debajo, sin fundirse ella misma) — un crossfade real. Solo la última escena
sigue con fade a negro al final, porque no hay nada que la cubra.

Esto **no cambia la duración total**: cada escena solo adelanta su propio
arranque tomando frames prestados de la cola de la anterior; el final de la
última escena (y por lo tanto `getTotalFrames`/`calculateReelMetadata`) no se
mueve. Ver `overlapFor()` y los tests de
`tests/unit/remotion/reel-duration.test.ts` que fijan justamente esa
invariante — es la misma clase de bug que ya rompió esto una vez (ver arriba),
así que cualquier cambio a este mecanismo tiene que mantener esos tests en verde.

Se quitó también el chip de texto "N / total" (la numeración explícita de
slide) — quedan los puntos de progreso arriba a la derecha, que se leen como
el indicador de una Story/Reel normal, no como paginación de una presentación.

## Estabilidad del fondo entre frames

Un QA con `picsum.photos` (URLs con `?random=`) mostró el fondo de una escena
cambiando de foto varias veces dentro de la misma escena — trazado a que esas
URLs devuelven una imagen nueva en cada fetch, no a un bug de Remotion. Se
verificó con una imagen real de `kefy-content-images` (Supabase Storage, la
que usa producción): frames extraídos al inicio y al final de una escena de 5s
muestran exactamente la misma foto, solo el paneo/zoom del Ken Burns cambia.
Si algún día una URL de imagen real no es estable (un host con redirects o
cache-busting), el síntoma sería el mismo — pero no es el caso de las URLs que
genera `uploadBase64Image`.

## Configuración

Env vars: `REMOTION_AWS_REGION`, `REMOTION_AWS_ACCESS_KEY_ID`,
`REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`,
`REMOTION_SERVE_URL`, y `CRON_SECRET` para el reconciliador.
Deploy inicial: `npx tsx scripts/deploy-remotion-lambda.ts`
(Lambda: 3008 MB, 240 s; render: `framesPerLambda: 120`).

Tests: `tests/unit/lib/reel-render.test.ts`, `tests/unit/api/reel-render.test.ts`,
`tests/unit/api/reel-reconcile.test.ts`, `tests/unit/remotion/reel-duration.test.ts`.

## Audio: música de fondo y SFX

`ReelComposition.tsx` mezcla dos capas de audio, ninguna generada por IA:

- **SFX de transición/logo** — `remotion/public/audio/sfx/*.ogg`, CC0
  (Kenney, ver `LICENSE-kenney.txt` en esa carpeta). Un sonido "drop" distinto
  por corte de escena (ciclando por índice) y un "pluck" en la entrada del
  logo. La escena 1 (el hook) no lleva SFX de corte para no chocar con el del
  logo — ver `TRANSITION_SFX` / `LOGO_SFX` en `ReelComposition.tsx`.
- **Música de fondo** — opcional, prop `musicTrack` (nombre de archivo bajo
  `remotion/public/audio/music/`). `lib/reel-render` no la toca; la elige
  `POST /api/content/reel/render` vía `pickMusicTrack()` en
  `remotion/audio-tracks.ts`, determinístico por `target.id` (mismo item →
  misma pista en reintentos). Si `MUSIC_TRACKS` está vacío, `musicTrack` es
  `undefined` y el `<Audio>` de música simplemente no se renderiza — no rompe
  nada tener cero pistas.

**Agregar/quitar una pista de música:** dejar el `.mp3` en
`remotion/public/audio/music/` y añadir su nombre a `MUSIC_TRACKS` en
`remotion/audio-tracks.ts`. Igual que cualquier cambio en `remotion/**`, hay
que re-desplegar el sitio (`npx tsx scripts/deploy-remotion-lambda.ts`) para
que Lambda vea el archivo nuevo.

**`publicDir` explícito:** tanto `remotion.config.ts` (Studio local) como
`scripts/deploy-remotion-lambda.ts` (`deploySite`) fijan `publicDir` a
`remotion/public/` a propósito. Sin eso, Remotion podría auto-detectar el
`public/` de la app Next.js (favicons, imágenes de marketing) en su lugar.

**Ken Burns variable:** cada escena usa uno de 4 movimientos de cámara
(`CAMERA_MOVES`, ciclado por índice) en vez de siempre el mismo zoom-in, para
que una serie de escenas no se sienta como el mismo clip repetido.
