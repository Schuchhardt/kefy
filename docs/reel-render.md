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

## Configuración

Env vars: `REMOTION_AWS_REGION`, `REMOTION_AWS_ACCESS_KEY_ID`,
`REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_LAMBDA_FUNCTION_NAME`,
`REMOTION_SERVE_URL`, y `CRON_SECRET` para el reconciliador.
Deploy inicial: `npx tsx scripts/deploy-remotion-lambda.ts`
(Lambda: 3008 MB, 240 s; render: `framesPerLambda: 120`).

Tests: `tests/unit/lib/reel-render.test.ts`, `tests/unit/api/reel-render.test.ts`,
`tests/unit/api/reel-reconcile.test.ts`, `tests/unit/remotion/reel-duration.test.ts`.
