# Pipeline de video: guion → herramientas → montaje

Un reel (o el video de una story) ya no es una secuencia de slides con texto.
Es un **guion corto plano a plano**. Cada plano dice qué se ve, cuánto dura,
qué se dice y quién lo dice. Ese guion se compila en una **lista de llamadas a
herramientas** (generar imagen, voz, animar, lipsync, montar) que corren en la
nube. El usuario ve esa lista con su costo antes de gastar nada.

Referencia: el «modo automático» de [openfilm](https://github.com/openfilm/openfilm).
Allí, un agente sigue un manual: planifica la película plano a plano, llama a
verbos (`get image`, `get video`, `get tts`…) sobre proveedores
intercambiables, deja un `.vtt` con tiempos por palabra junto a cada voz y pide
confirmación antes de cada clip de video. De openfilm tomamos:

- la interfaz única de herramientas,
- los subtítulos por palabra,
- la confirmación antes de gastar,
- la degradación a foto cuando no hay clip.

openfilm no guarda el plan como dato: vive en el razonamiento del agente. Aquí
el plan es estructurado, para poder listarlo, cotizarlo y ejecutarlo fuera del
request.

## Piezas

| Archivo | Qué hace |
|---|---|
| `lib/video/script.ts` | Tipo `VideoScript` y `normalizeVideoScript` (vuelve válido el JSON de Claude). También `mergeSlideEdits` (las ediciones de escenas llegan al guion) y `scriptFromSlides` (reels anteriores, stories) |
| `prompts/video-script.prompt.md` + `generateVideoScript` (`lib/ai.ts`) | Claude escribe el guion |
| `lib/video/plan.ts` | `compileVideoPlan`: guion → pasos con dependencias, `$ref` y costo. Es puro |
| `lib/video/tools/*` | Las herramientas: `generate_image`, `text_to_speech`, `animate_image`, `lip_sync`, `compose_video` |
| `lib/video/engine.ts` | `advanceVideoJob`: una «vuelta» al trabajo. Lanza lo que está listo, consulta lo que está en la nube y cierra |
| `lib/video/timeline.ts` | Guion + salidas → props de la composición `KefyFilm` (pura) |
| `remotion/FilmComposition.tsx` | El montaje: clips, fotos con cámara, voces, subtítulos palabra a palabra, transiciones, música y logo |
| `lib/services/video.ts` | `getVideoPlan` / `produceVideo` / `getVideoProduction`, compartidos por la UI, el asistente, la API y el MCP |
| `lib/assistant/tools/video.ts` | `get_video_plan`, `produce_video` (con confirmación) y `get_video_status` |
| `components/dashboard/content/VideoPlanPanel.tsx` | Panel del plan y del avance, dentro de `MuxReelPlayer` |
| `db/migrations/20261019000001_create_video_jobs.sql` | Tablas `kefy_video_jobs` y `kefy_video_steps`, y el bucket `kefy-video-assets` |

## El guion

```jsonc
{
  "title": "...", "hook": "caption del post", "hashtags": ["#..."],
  "visual_style": "warm 35mm film, golden hour",        // común a todas las imágenes
  "narrator": { "voice": "nova", "style": "..." },
  "characters": [{ "id": "ana", "name": "Ana", "look": "...", "voice": "coral", "voice_style": "..." }],
  "scenes": [{
    "duration_seconds": 3,                                 // estimación: manda la voz
    "speaker": "narrator" | "ana" | null,
    "line": "lo que se dice",
    "on_screen_text": "titular opcional",
    "visual": { "kind": "still" | "animated" | "talking", "image_prompt": "...",
                "motion_prompt": "...", "character_ids": ["ana"], "camera": "push_in" },
    "transition": "crossfade" | "cut" | "zoom" | "slide"
  }]
}
```

Se guarda en `metadata.video_script` del item (o de la rendición). `slides`
sigue existiendo como vista derivada (`scriptToReelScenes`) porque la usan las
previews, el editor y la biblioteca. Si el usuario edita una escena, el texto
nuevo entra al guion al producir (`mergeSlideEdits`), y las fotos que ya
produjo una pasada anterior se reutilizan.

## El plan

Así se ve el grafo de un plano con un personaje que habla:

```
char_ana ──► img_s2 ──► anim_s2 ──► lips_s2 ──┐
             voice_s2 ────────────► lips_s2   ├──► compose
img_s1 ──► anim_s1 ───────────────────────────┤
voice_s1 ─────────────────────────────────────┘
```

- **Personajes:** primero se genera un retrato de referencia. Ese retrato se
  pasa como imagen de referencia a cada plano donde aparece el personaje: así
  es la misma persona en todo el video. openfilm no tiene esto.
- **Nivel de animación (`motion`):**

  | Nivel | Qué anima |
  |---|---|
  | `none` | Nada: fotos con movimiento de cámara |
  | `key` (por defecto) | Lo que pidió el guion, priorizando el hook y los planos que hablan, hasta 3 planos |
  | `full` | Todos los planos |

- **Degradación en vez de error:**
  - Sin `FAL_KEY`, o con `motion: 'none'`, los planos animados salen como foto
    con cámara. Los que hablan salen como foto más voz en off.
  - Cada degradación deja una nota en el plan.

## Costo

Cada herramienta cobra su operación de créditos (`OPERATION_CREDIT_COSTS` en
`lib/plans.ts`, reexportado como `CREDIT_COSTS`):

| Herramienta | Proveedor | Créditos |
|---|---|---|
| `generate_image` | OpenAI (gpt-image) | 3 (`image`) |
| `text_to_speech` | OpenAI (`gpt-4o-mini-tts` + `whisper-1`) | 1 (`voice`) |
| `animate_image` | fal.ai (Kling 2.1 i2v, `FAL_ANIMATE_MODEL`) | 8 (`animation`) |
| `lip_sync` | fal.ai (sync-lipsync v2, `FAL_LIPSYNC_MODEL`) | 8 (`lipsync`) |
| `compose_video` | Remotion Lambda | 10 (`video`) |

Un reel de 5 planos con nivel `key` cuesta 54 créditos: 5 imágenes (15), 5
voces (5), 3 animaciones (24) y el montaje (10). La landing lo dice en «¿Cómo funcionan los
créditos?». Si cambian estos pesos, hay que cambiar también
`locales/*/landing.ts`.

Cuándo se cobra cada cosa:

1. `produceVideo` comprueba antes de cobrar que el plan entero quepa en lo que
   queda del mes. Si no cabe, responde 429 con `required` y `remaining`, y la UI
   propone menos animación.
2. Después cobra el montaje por la guardia de siempre (`chargeOrThrow` →
   `checkAiSpend`: suscripción → rate limit → créditos).
3. El motor cobra cada paso al lanzarlo. Si el paso falla del todo, devuelve
   los créditos. Si no hay créditos para un paso, ese paso se omite y el plano
   usa su respaldo: el video no se bloquea.

## El motor

No hay proceso de fondo: `advanceVideoJob` hace una vuelta y deja el trabajo
donde quedó. Esa vuelta la disparan tres cosas:

- **Polling del reproductor:** `GET /api/content/reel/render`, cada 4 s.
- **Cron:** `/api/content/reel/reconcile`, cada 5 min. Avanza hasta 8
  producciones por pasada.
- **Webhook de fal.ai:** `POST /api/webhooks/video?step=&sig=`. La URL va
  firmada con HMAC del id del paso (`VIDEO_WEBHOOK_SECRET`, o `CRON_SECRET` si
  falta). El cuerpo no se usa: el motor le pregunta el resultado a fal.

Garantías:

- **Reclamo atómico.** Para lanzarse, un paso pasa de `pending` a `running` con
  un `UPDATE … WHERE status = 'pending'`. Así dos vueltas simultáneas no lanzan
  el mismo paso dos veces.
- **Reintentos.** Hasta 2 intentos por paso (`MAX_STEP_ATTEMPTS`):
  - Un paso síncrono que lleva más de 4 min en `running` murió con su función:
    se reintenta.
  - Uno asíncrono que no termina en 30 min se da por fallido.
- **Respaldos.** El montaje es el único paso imprescindible
  (`lib/video/timeline.ts`). Para el visual de cada plano usa lo mejor que haya
  en este orden:
  1. el clip con lipsync,
  2. el clip animado más la voz aparte,
  3. la foto con movimiento de cámara,
  4. el fondo animado de la marca.

  La duración de cada plano sale de la voz real, no de la estimación del guion.
- **Cierre.** Al terminar el montaje, el video se escribe en `video_url`, con
  `render_status = 'ready'`. Antes de montar, las fotos se copian a `slides` y
  a `image_url` (la portada).

## Rutas

| Ruta | Para qué |
|---|---|
| `GET /api/content/reel/plan?itemId=&format=&motion=&lang=` | Plan, costo por nivel de animación y créditos restantes. No gasta nada |
| `POST /api/content/reel/render` `{ itemId, format?, produce: true, motion?, force? }` | Produce. **Sin `produce: true` un reel con guion no gasta nada**: responde `needs_confirmation`, y así un cliente viejo que dispara el render al montar no consume créditos |
| `GET /api/content/reel/render?itemId=` | Una vuelta del motor. Responde `render_status` / `progress` / `video_url` (el mismo contrato que el render de siempre) más `production` con el estado de cada paso |

Las piezas **sin guion** (reels anteriores al pipeline, rendiciones de formato)
siguen por el render directo `KefyReel` (`docs/reel-render.md`). Si se pide
producirlas por el servicio (`produce_video`), se arma un guion desde sus
escenas.

## Configuración

| Variable | Para qué |
|---|---|
| `FAL_KEY` | Sin ella no hay animación ni lipsync; el resto funciona |
| `FAL_ANIMATE_MODEL`, `FAL_LIPSYNC_MODEL`, `OPENAI_TTS_MODEL` | Opcionales: cambian el modelo sin tocar código |
| `VIDEO_WEBHOOK_SECRET` | Opcional: firma de los webhooks |
| Las de Remotion (`docs/reel-render.md`) | El montaje |

Hay que **re-desplegar el sitio de Remotion**
(`npx tsx scripts/deploy-remotion-lambda.ts`) para que Lambda tenga la
composición `KefyFilm`.

También hay que aplicar la migración `20261019000001_create_video_jobs.sql`.
Esa migración crea el bucket `kefy-video-assets`, que es público: Lambda y fal
descargan de ahí las voces.

## Tests

| Archivo | Qué cubre |
|---|---|
| `tests/unit/lib/video/script.test.ts` | Normalización del guion, ediciones de escenas y guion desde slides |
| `tests/unit/lib/video/plan.test.ts` | Grafo, costo, niveles de animación, degradación y `$ref` |
| `tests/unit/lib/video/timeline.test.ts` | Respaldos, duración por voz y voz dentro del clip |
| `tests/unit/lib/video/audio.test.ts` | Duración de WAV (incluido el streaming de OpenAI) y alineación de palabras |
| `tests/unit/lib/video/engine.test.ts` | Producción completa, fallos con reembolso, omisión sin créditos, reclamo atómico |
| `tests/unit/api/video-production.test.ts` | Plan, confirmación obligatoria, tope de créditos, suscripción, no duplicar |
| `tests/unit/remotion/film-duration.test.ts` | Duración = suma de planos, transiciones y páginas de subtítulos |

## Pendiente

- Las conversiones de formato (`/api/content/[itemId]/renditions`) todavía
  escriben escenas de texto con `generateReelScript`. Se producen por el
  pipeline solo si se pide explícitamente (`scriptFromSlides`).
- No hay un bucle de revisión como el `openfilm look`, donde un modelo mira
  cuadros del render y corrige.
- Un editor del guion con personajes, tipo de plano y voz.
