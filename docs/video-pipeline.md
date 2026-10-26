# Pipeline de video: guion → herramientas → montaje

Un reel (o el video de una story) ya no es una secuencia de slides con texto.
Es un **guion corto plano a plano**. Cada plano dice qué se ve, cuánto dura y
qué dice el narrador. **Nadie habla a cámara:** toda línea es del narrador, en
off (`narratorOnly`, ver «Solo narrador»). Ese guion se compila en una **lista de llamadas a
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
| `lib/video/tools/*` | Las herramientas: `generate_image`, `text_to_speech` (ElevenLabs u OpenAI), `animate_image`, `lip_sync`, `compose_video` |
| `lib/video/higgsfield.ts`, `lib/video/fal.ts` | Clientes de las colas de video. `animate_image` usa Higgsfield si está configurado, si no fal |
| `lib/video/engine.ts` | `advanceVideoJob`: una «vuelta» al trabajo. Lanza lo que está listo, consulta lo que está en la nube y cierra |
| `lib/video/timeline.ts` | Guion + salidas → props de la composición `KefyFilm` (pura) |
| `lib/video/brand.ts` | La marca del video: `resolveFilmTheme` (diseño), `videoBrandBrief` (copy) y `voiceAccent` (voz), cada uno con su respaldo |
| `remotion/FilmComposition.tsx` | El montaje: clips, fotos con cámara, voces, subtítulos palabra a palabra, transiciones, música, logo y tarjeta de cierre |
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
previews, el editor y la biblioteca. Cada escena lleva el `scene_id` de su
plano (`sanitizePatchSlides` lo conserva al editar).

Si el usuario edita una escena, el texto nuevo entra al guion al producir
(`mergeSlideEdits`):

- Escena y plano se emparejan **por `scene_id`, no por posición**. Si se borra
  o reordena una escena, cada plano conserva su personaje, su tipo y su
  lipsync.
- Una escena nueva entra como foto con narrador.
- Si la línea de un plano con lipsync cambia de hablante, deja de ser lipsync.
- Las fotos que ya produjo una pasada anterior se reutilizan, con dos
  condiciones: que estén limpias (`text_baked: false`) y que sean del Storage
  de Kefy (`isKefyStorageUrl`). Una URL cualquiera pegada en una escena no se
  manda a fal.ai ni a Lambda. Las fotos de reels anteriores (sin `text_baked`)
  se tratan como quemadas y se regeneran: si no, el montaje les pondría encima
  el texto otra vez.

## Solo narrador

`narratorOnly` (`lib/video/script.ts`) se aplica en `scriptForTarget` a todo
guion que se cotiza o se produce, también a los guardados antes:

- cada línea la dice el narrador (`speaker: 'narrator'`);
- un plano `talking` queda como `animated`;
- los personajes siguen como aspecto (el retrato de referencia hace que sea la
  misma persona en todos los planos), sin voz.

El prompt (`prompts/video-script.prompt.md`) ya no pide planos `talking` ni
voces de personajes. Así todos los clips son mudos y se puede animar con un
modelo barato (Kling 2.5 Turbo). El camino de los planos que hablan (Seedance
con audio, o lipsync en fal) sigue en el código, pero ningún guion llega a él.

## El plan

Con **Higgsfield** y un modelo que genera el audio del clip (Seedance 2.0, si
se configura en `HIGGSFIELD_ANIMATE_MODEL`), un plano donde
habla un personaje es una sola animación que dice la línea:

```
char_ana ──► img_s2 ──► anim_s2 (dice la línea) ──┐
img_s1 ──► anim_s1 (mudo) ────────────────────────┤──► compose
voice_s1 (narrador) ──────────────────────────────┘
```

- El prompt de la animación lleva la línea entre comillas, el idioma, el
  acento (`voiceAccent`) y el `voice_style` del personaje. El clip dura lo que
  tarda en decirse (`speakingClipSeconds`, 4–15 s).
- Al terminar, el clip se transcribe con whisper: esos son los subtítulos
  palabra a palabra. Sin transcripción se reparten sobre el clip.
- Los planos animados que no hablan piden `generate_audio: false`: debajo
  suenan la música y el narrador, y un audio inventado chocaría.
- El narrador sigue siendo TTS: no está en cuadro.
- La voz del mismo personaje puede variar un poco entre planos: cada clip la
  genera de nuevo.

Con **fal** (respaldo si no hay Higgsfield), así se ve el grafo de un plano con
un personaje que habla:

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

- **Degradación en vez de error.** Cada degradación deja una nota en el plan.

  | Situación | Qué pasa |
  |---|---|
  | Sin `FAL_KEY` o con `motion: 'none'` | Los planos animados salen como foto con cámara, y los que hablan como foto con voz en off |
  | Sin OpenAI o con `generate_images: false` | No hay fotos: los planos usan el fondo animado de marca. Sin foto tampoco hay animación |
  | Sin voz | No hay locución ni lipsync; quedan los textos en pantalla |

## Marca: diseño, copy y voz

Todo sale de `lib/video/brand.ts`, y cada campo del Brand Kit se valida.
Cuando un campo no sirve, entra un respaldo pensado como diseño propio, no como
un hueco: un video sin Brand Kit tiene que verse bien igual.

| Qué | Con marca | Respaldo |
|---|---|---|
| Acento (subtítulos, titulares, barra) | `accent_color`, o si no destaca (gris, casi negro o casi blanco), `primary_color` o `secondary_color` | Amarillo cálido `#ffd23f` sobre tinta, el estilo de subtítulos de los reels nativos |
| Texto sobre el acento y sobre el fondo | Tinta o blanco, el que dé más contraste (≥ 4,5:1, WCAG) | Igual |
| Fondo (planos sin foto y cierre) | `primary_color`. Si es claro, se oscurece para que los subtítulos blancos se lean | Tinta `#14141c` → `#2a2440` |
| Tipografías | `font_heading` / `font_body`, solo si están en el catálogo de Google Fonts (`lib/google-fonts.ts`). Una de las dos sirve para ambas | Montserrat |
| Logo | `logo_url` (https) dentro de un chip blanco: un logo oscuro no desaparece sobre una foto oscura | Nombre de la marca en la tipografía de titulares. Sin nombre, nada |
| Cierre (2,2 s) | Logo o nombre, `tagline` y contacto: la web (`depando.cl`) o el @ de Instagram | Sin nombre ni logo, no hay cierre: el último plano funde a negro |
| Copy del guion | `videoBrandBrief`: audiencia, diferenciales, misión, tono, estilo, ubicación, contacto para el CTA y si usa emojis. Prohíbe inventar precios o promesas | Guía de respaldo: experto local cercano, beneficios concretos, CTA simple, estilo visual coherente con el tema |
| Voz | `voiceAccent` según `customer_locations` (España, México, Argentina) | Español latinoamericano neutro y un estilo de locución de reel |
| Música | `pickMusicTrack(id, ánimo, recientes)`: el ánimo sale del `music_mood` del guion más el tono de la marca (`TRACK_MOODS`); evita las pistas de los últimos 3 videos de la marca (`recentMusicTracks`) para que no suene siempre la misma | Cualquier pista que no se haya usado hace poco |

El tema se resuelve al crear el trabajo y viaja en su `render_context`: editar
el Brand Kit a mitad de producción no cambia un video que ya se está haciendo.

En el render, nada de la marca puede tumbar el video:

- **Imagen o logo que no carga** (`SafeImg`): la imagen se oculta y queda el
  fondo de marca, o el nombre en vez del logo. Sin esto, Remotion cancelaba el
  render entero y solo se devolvían los créditos del montaje.
- **Tipografías**: se piden a Google Fonts de más a menos pesos (no todas
  tienen 800/900), y el render espera a `document.fonts.load`.

## Costo

Cada herramienta cobra su operación de créditos (`OPERATION_CREDIT_COSTS` en
`lib/plans.ts`, reexportado como `CREDIT_COSTS`):

| Herramienta | Proveedor | Créditos |
|---|---|---|
| `generate_image` | OpenAI (gpt-image) | 3 (`image`) |
| `text_to_speech` | ElevenLabs (Flash v2.5, `/with-timestamps`) o, de respaldo, OpenAI (`gpt-4o-mini-tts` + `whisper-1`) | 1 (`voice`) |
| `animate_image` | Higgsfield (Kling 2.5 Turbo i2v, `HIGGSFIELD_ANIMATE_MODEL`) o fal.ai (Kling 2.1 i2v, `FAL_ANIMATE_MODEL`) | 8 (`animation`) |
| `lip_sync` | fal.ai (sync-lipsync v2, `FAL_LIPSYNC_MODEL`). Con Higgsfield no se usa | 8 (`lipsync`) |
| `compose_video` | Remotion Lambda | 10 (`video`) |

Costo para Kefy (octubre 2026, precios de lista) de un reel de 5 planos con
nivel `key`: ~US$1. Son 3 clips de 5 s en Kling 2.5 Turbo (~$0,036/s, $0,54),
5 imágenes (~$0,28), el guion (~$0,08), la narración en ElevenLabs Flash
(~$0,05 / 1.000 caracteres, ~$0,02) y Lambda (~$0,03). Con Seedance 2.0 los
clips costaban ~$1,80.

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
4. Devoluciones (`refundChargedSteps`, un `UPDATE charged = true → false`
   que devuelve cada crédito una sola vez aunque corran varias vueltas):
   - **El trabajo falla** (el montaje no salió): se devuelve todo, también
     las imágenes, voces y clips que sí se hicieron. Sin video no se cobra.
   - **El trabajo se cancela** (`superseded` o `target_deleted`): se devuelve
     lo pendiente o en curso, incluido el montaje prepagado. Lo ya hecho queda
     cobrado: la cancelación la causó el usuario.
   - Las devoluciones van al mes en curso: un trabajo que cruza de mes
     devuelve al mes nuevo.

## El motor

No hay proceso de fondo: `advanceVideoJob` hace una vuelta y deja el trabajo
donde quedó. Esa vuelta la disparan tres cosas:

- **Polling del reproductor:** `GET /api/content/reel/render`, 4 s después
  de la respuesta anterior. Cada vuelta tiene 20 s de presupuesto
  (`POLL_BUDGET_MS`); los pasos que lance terminan igual.
- **Cron:** `/api/content/reel/reconcile`, cada 5 min.
  - Avanza hasta 8 producciones, de a 2 a la vez. Cada una puede lanzar 6
    imágenes; más a la vez chocaría con el rate limit de OpenAI.
  - Empieza por las que llevan más tiempo sin vuelta (`advanced_at`).
  - No empieza una vuelta nueva pasados 150 s.
- **Webhook de Higgsfield o fal.ai:** `POST /api/webhooks/video?step=&sig=` (`hf_webhook` / `fal_webhook`).
  - La URL va firmada con HMAC del id del paso (`VIDEO_WEBHOOK_SECRET`, o
    `CRON_SECRET` si falta).
  - El cuerpo no se usa: el motor le pregunta el resultado a fal.
  - Solo consulta y encola pasos asíncronos (`syncSteps: false`). Una imagen
    de un minuto lanzada al final de la función podía quedar cortada y
    pagarse dos veces.
- **Asistente:** `get_video_status` hace una vuelta de 5 s.

Garantías:

- **Reclamo atómico.** Para lanzarse, un paso pasa de `pending` a `running` con
  un `UPDATE … WHERE status = 'pending'`. Así dos vueltas simultáneas no lanzan
  el mismo paso dos veces.
- **Guarda por intento.** Toda actualización de un paso exige el mismo
  `status` y `attempts` que conoce la vuelta (`updateStep`). Sin esto:
  - una vuelta atrasada podía devolver a `pending` un intento nuevo, dejando
    huérfano un trabajo de fal ya pagado;
  - tres vueltas sobre el mismo fallo devolvían tres veces los créditos.

  Ahora devuelve los créditos solo la vuelta que de verdad marcó el fallo.
- **Una producción por pieza.** Un índice único parcial
  (`target_table, target_id WHERE status = 'running'`) frena el doble clic: el
  segundo «Producir» devuelve el trabajo del primero.
- **Guion nuevo, producción nueva.** Si el usuario editó la pieza (o eligió
  otro nivel de animación) mientras se producía y vuelve a producir, el
  trabajo viejo se cancela (`superseded`). Pero recién después de validar y
  cobrar el nuevo: un 409 o un 429 no deja la pieza sin producción.
  La pieza apunta al trabajo nuevo (`video_job_id`, un UUID generado antes)
  antes de que el trabajo exista: así ninguna vuelta del cron lo ve sin dueño
  y lo cancela.
  Un trabajo solo escribe en la pieza si `metadata.video_job_id` sigue
  apuntando a él. Antes de montar copia a las escenas solo las URLs de las
  fotos, sin pisar el texto editado.
- **Pieza borrada.** El trabajo se cancela (`target_deleted`), deja de
  gastar y devuelve lo que no llegó a hacer.
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

  La duración de cada plano sale de la voz real, no de la estimación del guion,
  y una voz larga nunca se corta.

  Un clip corre una sola vez, sin `<Loop>`. Repetirlo se notaba como un salto
  y, en un clip con lipsync, repetía las primeras sílabas de la línea. Un clip
  mudo más corto que el plano (el clip de 5 s bajo una voz de 6,5 s) se
  ralentiza hasta cubrirlo (`clipPlaybackRate`, como mínimo a 0,6×): congelar
  su último cuadro se veía como un video pegado antes del corte. Solo si haría
  falta ir más lento queda congelado el resto, con el movimiento de cámara
  encima. Un clip con audio (lipsync o el que dice la línea) va siempre a 1×.
- **Cierre.** Al terminar el montaje, el video se escribe en `video_url`, con
  `render_status = 'ready'`. Antes de montar, las fotos se copian a `slides` y
  a `image_url` (la portada, solo si no tenía). Al reemplazar un video
  (`force`), el anterior se queda hasta que el nuevo exista; si la producción
  falla, la pieza sigue `ready` con el anterior.
- **Proveedores lentos.** Un 408, 429 o 5xx de fal no es un fallo: se vuelve a
  mirar. Si no, un trabajo que sigue corriendo se volvería a encolar y se
  pagaría dos veces.
- **Sin montaje no se cobra nada.** Si Lambda no está configurado,
  `produceVideo` responde 503 antes de cobrar el primer paso.

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
| `HIGGSFIELD_API_KEY` | `KEY_ID:KEY_SECRET` de console.higgsfield.ai (o `HF_API_KEY_ID` + `HF_API_KEY_SECRET`). Animación; tiene prioridad sobre fal |
| `HIGGSFIELD_ANIMATE_MODEL` | Opcional: por defecto `kling-video/v2.5-turbo/standard/image-to-video` (mudo: `prompt`, `image_url`, `duration` 5 o 10, `negative_prompt`). Un modelo `bytedance/seedance…` recibe `resolution` y `generate_audio` y puede decir la línea |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Voz del narrador. Las dos o ninguna. Sin ellas, o si ElevenLabs falla, OpenAI |
| `ELEVENLABS_MODEL` | Opcional: por defecto `eleven_flash_v2_5` (con `language_code`). `eleven_multilingual_v2` no lo acepta y no se le manda |
| `FAL_KEY` | Respaldo: animación y lipsync en fal. Sin Higgsfield ni fal no hay animación; el resto funciona |
| `FAL_ANIMATE_MODEL`, `FAL_LIPSYNC_MODEL`, `OPENAI_TTS_MODEL` | Opcionales: cambian el modelo sin tocar código |
| `VIDEO_WEBHOOK_SECRET` | Opcional: firma de los webhooks |
| Las de Remotion (`docs/reel-render.md`) | El montaje |

## Probar el diseño en local

Para revisar cambios de diseño sin proveedores, `KefyFilm` se renderiza con
unas props en JSON:

```bash
npx remotion render remotion/Root.tsx KefyFilm out.mp4 --props=props.json \
  --browser-executable=/ruta/a/chrome   # en la nube: /opt/pw-browsers/...
npx remotion still remotion/Root.tsx KefyFilm frame.png --frame=60 --props=props.json
```

Para armar las props hay que pasar el guion por `buildFilmProps`, con el tema
de `resolveFilmTheme`, las URLs de fotos y voces, y los tiempos por palabra
(`alignWords`). Remotion Studio (`npx remotion studio remotion/Root.tsx`)
muestra la muestra de `Root.tsx`.

## Despliegue

Hay que **re-desplegar el sitio de Remotion**
(`npx tsx scripts/deploy-remotion-lambda.ts`) para que Lambda tenga la
composición `KefyFilm`.

También hay que aplicar la migración `20261019000001_create_video_jobs.sql`.
Esa migración crea el bucket `kefy-video-assets`, que es público: Lambda y fal
descargan de ahí las voces.

## Tests

| Archivo | Qué cubre |
|---|---|
| `tests/unit/lib/video/script.test.ts` | Normalización del guion, solo narrador, ediciones por `scene_id`, fotos quemadas o externas y guion desde slides |
| `tests/unit/lib/video/brand.test.ts` | Tema de marca, contraste, respaldos, brief del copy, acento de voz y música por ánimo |
| `tests/unit/lib/video/fal.test.ts` | Contrato de la cola de fal: webhook, estados, 408/429/5xx como pendientes |
| `tests/unit/lib/video/higgsfield.test.ts` | Contrato de Higgsfield: credenciales, `hf_webhook`, idempotencia, estados |
| `tests/unit/lib/video/motion.test.ts` | `animate_image` con Higgsfield: Kling mudo por defecto, con Seedance audio solo si habla, transcripción del clip, handles viejos de fal |
| `tests/unit/lib/video/voice.test.ts` | Narrador con ElevenLabs (voz del env, idioma, tiempos de la alineación) y respaldo en OpenAI |
| `tests/unit/lib/services/content-slides.test.ts` | Editar escenas conserva `scene_id` |
| `tests/unit/lib/video/plan.test.ts` | Grafo, costo, niveles de animación, degradación y `$ref` |
| `tests/unit/lib/video/timeline.test.ts` | Respaldos, duración por voz y voz dentro del clip |
| `tests/unit/lib/video/audio.test.ts` | Duración de WAV (incluido el streaming de OpenAI) y alineación de palabras |
| `tests/unit/lib/video/engine.test.ts` | Producción completa, fallos con un solo reembolso, omisión sin créditos, reclamo atómico, webhook sin pasos síncronos, pieza borrada o reemplazada, fotos sin pisar el texto |
| `tests/unit/api/video-production.test.ts` | Plan, confirmación obligatoria, tope de créditos, suscripción, sin Lambda no cobra, `force` conserva el video, guion nuevo cancela el viejo, no duplicar |
| `tests/unit/remotion/film-duration.test.ts` | Duración = suma de planos más el cierre, transiciones y páginas de subtítulos |

## Pendiente

- Las conversiones de formato (`/api/content/[itemId]/renditions`) todavía
  escriben escenas de texto con `generateReelScript`. Se producen por el
  pipeline solo si se pide explícitamente (`scriptFromSlides`).
- No hay un bucle de revisión como el `openfilm look`, donde un modelo mira
  cuadros del render y corrige.
- Un editor del guion con personajes, tipo de plano y voz.
