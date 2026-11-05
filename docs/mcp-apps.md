# MCP Apps: revisión de contenido dentro del chat

Documento de referencia de las vistas interactivas que el servidor MCP de Kefy
(`/api/mcp`) muestra dentro de Claude (web, desktop, móvil) y de cualquier host
que implemente [MCP Apps](https://modelcontextprotocol.io/extensions/apps/build)
(spec `2026-01-26`, SDK `@modelcontextprotocol/ext-apps` 2.x). Leerlo antes de
tocar `lib/mcp-app/**`, `mcp-app/**`, `lib/services/content-view.ts`,
`lib/services/video-view.ts`, `lib/assistant/app-views.ts`,
`lib/assistant/tools/apps.ts` o el campo `app` de una herramienta.

Antes, `create_story` devolvía un JSON con una URL y había que abrir kefy.app
para ver la pieza. Ahora la pieza aparece en el chat tal como se vería
publicada, con controles de revisión al lado.

## 1. Decisión de arquitectura

El servidor MCP de Kefy **no usa el SDK oficial**: es un despachador JSON-RPC
propio (`lib/assistant/mcp.ts`), Streamable HTTP **sin estado**, autenticado con
API key u OAuth (`lib/assistant/api-keys.ts`, `lib/assistant/oauth.ts`). Por eso
no se usan `registerAppTool` / `registerAppResource` ni Skybridge: se escribe a
mano exactamente lo que escriben esos helpers (lo verifica
`tests/unit/lib/mcp-app/server.test.ts` contra las constantes del SDK):

- La herramienta lleva `_meta.ui.resourceUri` (y la clave antigua
  `_meta["ui/resourceUri"]`, que el SDK sigue escribiendo por compatibilidad) y
  `_meta.ui.visibility`.
- `resources/read` del `ui://` devuelve el HTML con mimeType
  `text/html;profile=mcp-app` y la CSP en `_meta.ui.csp`.

Skybridge queda descartado para v1: obligaba a migrar 60+ herramientas con auth
propia. Si más adelante se publica en el store de ChatGPT, se reevalúa.

**Sin estado ⇒ `_meta.ui` siempre.** Cada POST es independiente, así que el
servidor no puede recordar si el cliente anunció
`capabilities.extensions["io.modelcontextprotocol/ui"]` en `initialize`. La
especificación dice que un cliente que no implementa la extensión ignora
`_meta`; el texto (`content[].text`) es el mismo de siempre. Por eso no hay
detección de capacidad por petición.

## 2. Qué cambia en el protocolo

| Método | Antes | Ahora |
|---|---|---|
| `initialize` | `capabilities: { tools }` | `capabilities: { tools, resources: { listChanged: false } }` |
| `resources/list` | -32601 | Las dos vistas `ui://` con su CSP |
| `resources/templates/list` | -32601 | `{ resourceTemplates: [] }` |
| `resources/read` | -32601 | HTML de la vista; otro `uri` → `-32002` (*Resource not found*) |
| `tools/list` | sin `_meta` | `_meta.ui` y `outputSchema` en las herramientas con `app` |
| `tools/call` | `content` + `structuredContent: { data, links }` | igual, y además `structuredContent.view` en las que abren vista |

**El `content[].text` no cambia nunca.** Sigue siendo `JSON.stringify({ data,
links })`. La vista va solo en `structuredContent.view`, que MCP Apps no añade
al contexto del modelo. Lo cubre `tests/unit/api/mcp-apps.test.ts`
(*regresión: el texto es exactamente el JSON de {data, links}*).

## 3. Las dos vistas (un solo bundle)

| Recurso | Vista | La abren |
|---|---|---|
| `ui://kefy/content-review.html` | **Vista 1**: revisor de contenido | `create_post`, `create_story`, `create_carousel`, `create_reel`, `get_content`, `review_content` |
| `ui://kefy/video-plan.html` | **Vista 2**: plan y producción de video | `get_video_plan`, `produce_video`, `get_video_status` |

Los dos `uri` sirven **el mismo HTML** (`mcp-app/dist/kefy-app.html`): la vista
elige qué pintar por `structuredContent.view.kind` (`content` | `video`), y la
Vista 1 abre la 2 («Producir video») sin salir de la tarjeta.

### Vista 1 — revisor de contenido

Ancho máx. 420 px; en inline alto máx. 600 px con scroll interno, en fullscreen
todo el alto («Expandir» pide `ui/request-display-mode` solo si el usuario lo
toca y el host lo ofrece).

| Tipo | Previsualización |
|---|---|
| story | Marco 9:16 con la imagen de fondo y el caption sobre un degradado; con `video_url`, `<video>` 9:16 con póster |
| post | Tarjeta de feed: marca, imagen (proporción real), texto y hashtags |
| carousel | Galería con scroll-snap, una tarjeta por slide e indicador 1/N |
| reel | Con video, reproductor 9:16; sin video, storyboard de escenas + aviso + «Producir video» |

`create_reel` con `variant_count > 1` muestra las variantes en pestañas.

Botones (el servidor los decide en `item.actions`, la vista no recalcula reglas
— `contentActions` en `lib/services/content-view.ts`):

| Acción | Herramienta | Cuándo |
|---|---|---|
| Aprobar / Volver a borrador | `update_content { status }` | borrador / aprobado |
| Archivar (con confirmación) | `update_content { status: 'archived' }` | borrador o aprobado |
| Editar texto (título, cuerpo, hashtags) | `update_content` | borrador o aprobado |
| Regenerar imagen (instrucción + tamaño, costo antes) | `generate_content_image` con la imagen actual como referencia | borrador o aprobado |
| Pedir cambios | `ui/message`: «Sobre el contenido {id}: {instrucción}» | siempre |
| Convertir a otro formato (costo antes; «ya generada» es gratis) | `convert_content_format` | si no está archivado |
| Producir video | abre la Vista 2 | reel sin video, o story |
| Publicar / programar (cuentas reales, revisión antes del botón final) | `list_social_accounts` + `list_publish_targets` → `publish_content` | aprobado, programado o publicado (y reel con video) y scope `publish`. En programado o publicado sirve para llevarlo a las cuentas que faltan: las que ya lo tienen o cuya red no admite el formato no se pueden marcar |
| Abrir en Kefy | `ui/open-link` | siempre |

Tras cada acción que muta, la vista vuelve a pedir la pieza con
`review_content` y re-renderiza (no asume el resultado). Una imagen en
`generating`, una acción que superó el tiempo del host o un pedido al asistente
se siguen recargando cada 5 s (hasta 3 min) hasta ver el cambio.

### Vista 2 — plan y producción de video

- **Plan:** storyboard por plano (foto, duración, texto y herramientas que lo
  producen), nivel de animación `none` / `key` / `full` con el total de cada uno
  y los créditos que quedan. «Producir video» → confirmación de costo →
  `produce_video` (con `force: true` si ya había video, tras avisarlo).
  Una story sin guion (`needs_script`) pasa antes por «Preparar guion
  (1 crédito)» → `prepare_story_video` → `get_video_plan`.
- **Produciendo:** barra de progreso y pasos. `get_video_status` cada 5 s
  mientras `status = running`: esa herramienta **también avanza el trabajo**,
  así que el polling es parte del mecanismo. Se detiene al terminar, al fallar,
  y al desmontar la vista (el host manda `ui/resource-teardown`).
- **Falló:** el paso que falló y «Reintentar» (`produce_video` con `force`).
- **Listo:** reproductor 9:16, aprobar y publicar, y un `ui/message` «El video
  de {título} está listo» (una sola vez, y solo si la vista vio correr la
  producción).

## 4. Herramientas

| Herramienta | `app` |
|---|---|
| `review_content` (nueva, **solo MCP**) | Vista 1. Texto para el modelo: un resumen corto (tipo, estado, si tiene imagen o video), no el JSON de la vista. La vista también la usa para recargarse |
| `create_post`, `create_story`, `create_carousel`, `create_reel`, `get_content` | Vista 1 |
| `get_video_plan`, `produce_video`, `get_video_status` | Vista 2 |
| `update_content`, `generate_content_image`, `convert_content_format`, `prepare_story_video`, `list_social_accounts`, `list_publish_targets`, `publish_content` | `visibility: ['model', 'app']`, sin vista propia |

`ToolDef.app` (`lib/assistant/registry.ts`):

```ts
app: {
  resourceUri?: 'ui://kefy/content-review.html' | 'ui://kefy/video-plan.html',
  visibility?: ('model' | 'app')[],
  viewSchema?: z.ZodType,      // → outputSchema
  view?: (ctx, input, data) => Promise<View | null>,
}
```

Los ayudantes `contentReviewApp` y `videoPlanApp` (`lib/assistant/app-views.ts`)
arman ese objeto. **La vista se arma después de un resultado correcto y es best
effort**: si falla, se reporta a Sentry y el resultado sale igual, sin vista (la
pieza ya se creó y quizá se cobró). La vista de la UI, si no recibe `view`, la
pide con `review_content` / `get_video_plan` usando el `item_id` del resultado.

**Desvíos conscientes del documento de diseño:**

- **No hay herramientas solo-app** (`get_content_for_view`,
  `list_social_accounts_for_view`). El servidor no tiene estado y la
  especificación deja el filtrado de `visibility: ['app']` al host: un cliente
  sin MCP Apps (Claude Code CLI) las vería como herramientas normales. No hacen
  falta: `review_content` ya devuelve el texto limpio y sin truncar en
  `structuredContent.view` (que no entra en el contexto del modelo, y una
  llamada de la vista tampoco), y `list_social_accounts` ya devuelve las cuentas
  limpias (`id, platform, username, avatar_url, status`).
- **`outputSchema` sin `additionalProperties: false`**: un host que guarde el
  `tools/list` en caché no debe rechazar un resultado porque un despliegue nuevo
  añadió un campo. La forma exacta la vigilan los tests de contrato.

## 5. Contrato (`lib/mcp-app/contract.ts`)

`ContentViewSchema` y `VideoViewSchema` (zod) son el único acoplamiento entre el
servidor y el bundle. El servidor los publica como `outputSchema`
(`{ data, links?, view? }`) y la vista importa sus tipos con `import type`.
Cambiar la forma rompe la vista: subir `VIEW_VERSION`, actualizar `mcp-app/` y
los tests. Puntos del contrato:

- **Texto limpio.** `title`, `body`, `slides[].*`, líneas del guion: sin
  `<untrusted_content>` y sin tocar. La vista los pinta **siempre como texto**
  (React escapa; no hay `dangerouslySetInnerHTML` en `mcp-app/`). Lo prueban
  el servicio, la ruta y la UI con un body `<img src=x onerror=…>`.
- **`brand.id` explícito.** La vista lo reenvía en **cada** `tools/call`: una
  organización con varias marcas respondería `brand_required` sin él. La vista
  nunca cambia de marca; un `item_id` de otra marca es `not_found`.
- **`permissions: { write, publish }`** salen de los scopes de la conexión. Las
  conexiones OAuth (claude.ai) **nunca tienen `publish`** (ver
  `docs/assistant.md` §7): en claude.ai la tarjeta explica que se publica desde
  Kefy (`publish_blocked: 'no_publish_scope'`). Con una API key con `publish`,
  la tarjeta publica.
- **Costos desde el servidor** (`credits.image`, `credits.convert.*`,
  `credits.story_script`, `plan.credits_by_motion`, `credits.remaining`): salen
  de `CREDIT_COSTS` / `renditionCredits` / el plan de video, nunca escritos en
  la UI. Si los costos cambian, la tarjeta cambia sola.

## 6. Seguridad y CSP

- **La vista nunca llama a la API de Kefy.** Todo pasa por el host
  (`tools/call`) hacia `/api/mcp`, con la misma auth, scopes, suscripción,
  créditos (`chargeOrThrow`), rate limit y auditoría que las herramientas de
  texto. No hay endpoints HTTP nuevos ni tokens en la vista.
- **Bundle único** (`vite-plugin-singlefile`): CSS y JS inline, sin
  `<script src>` ni CDN.
- **CSP** (`appResourceDomains` en `lib/mcp-app/server.ts`): solo
  `resourceDomains` (img/video):
  - el origen de `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (imágenes, slides,
    avatar, videos subidos);
  - `https://s3.<REMOTION_AWS_REGION>.amazonaws.com` (el `out.mp4` de Remotion
    Lambda, URL path-style; por defecto `us-east-2`);
  - `MCP_APP_MEDIA_DOMAINS`: orígenes extra separados por comas (si el storage
    pasa a un CDN propio, se agrega aquí).
  Sin `connectDomains`: la vista no hace fetch.
- **Medios públicos.** Los `video_url` de S3 y el Storage de Supabase son
  públicos hoy. Si algún día dejan de serlo, firmar la URL al armar la vista
  (`buildContentView` / `buildVideoView`), no en la UI.
- **Acciones con costo** (regenerar 3, convertir 4–16, guion 1, producir según
  plan): costo visible y confirmación en la propia vista, con el botón
  desactivado si no alcanzan los créditos del mes. Recargar nunca gasta.
- **Irreversibles:** archivar y publicar ahora piden confirmación; publicar
  lista siempre las cuentas destino (nombre y red) antes del botón final.
- **`ui/message`** solo sale por acción del usuario (pedir cambios, publicar) o
  al terminar un video que la vista vio producir.

## 7. Build y desarrollo

```bash
npm run build:mcp-app                 # → mcp-app/dist/kefy-app.html (lo corren prebuild y predev)
npm run build:mcp-app -- --watch      # mientras se toca la vista
```

- `mcp-app/` es React + TypeScript, pero el bundle usa **`preact/compat`**
  (alias en `mcp-app/vite.config.mts`): misma API, ~120 KB menos. Con React el
  HTML pesaba 475 KB; con Preact, ~300 KB (~80 KB gzip), dentro del objetivo de
  400 KB. El SDK (`@modelcontextprotocol/client` + `core` + zod) es un chunk
  pre-empaquetado de ~200 KB que no se puede recortar. Los tests de la UI
  corren con React.
- `mcp-app/dist/` no se versiona. `next.config.ts` lo incluye en la función
  `/api/mcp/route` (`outputFileTracingIncludes`). Si falta, `resources/read`
  devuelve una página de texto sin scripts y lo reporta a Sentry.
- Textos en `locales/{es,en}/mcp-app.ts` (paridad comprobada por
  `tests/unit/locales/all-locales.test.ts`). El idioma lo da el `locale` del
  host; si no, el de la vista.
- Tema, variables de estilo y fuentes del host con `useHostStyles`; los tokens
  de `mcp-app/src/styles.css` (`--k-*`) caen a un respaldo claro/oscuro propio
  si el host no los manda.

**Probar en un host real:** `npm run dev`, exponer `http://localhost:3099` con
un túnel (`npx cloudflared tunnel --url http://localhost:3099`) y agregar
`https://<túnel>/api/mcp` como conector personalizado en claude.ai (Ajustes →
Conectores). También sirve el `basic-host` del repo
`modelcontextprotocol/ext-apps` o el MCP Inspector con soporte de Apps, con
`Authorization: Bearer kefy_sk_…`.

## 8. Tests

| Archivo | Qué cubre |
|---|---|
| `tests/unit/lib/mcp-app/server.test.ts` | Constantes iguales al SDK, CSP desde el entorno, `_meta.ui` como `registerAppTool`, `outputSchema` relajado, HTML y página de respaldo |
| `tests/unit/lib/services/content-view.test.ts` | Reglas de botones por estado/tipo/scopes, contrato con las filas reales (reel `286f513e…`, story `9f2986df…`, anonimizadas en `tests/unit/fixtures/mcp-app-items.ts`), texto limpio, variantes, scoping por marca |
| `tests/unit/lib/services/video-view.test.ts` | Story sin guion, plan con costo por nivel, estado de la producción, aprobar/publicar al terminar |
| `tests/unit/api/mcp-apps.test.ts` | De punta a punta por `/api/mcp`: recursos, `tools/list`, vista en `structuredContent`, **texto sin cambios**, `brand_id` en orgs con varias marcas, vista best effort |
| `tests/unit/mcp-app/*.test.tsx` | La UI con un host falso: XSS, layouts, aprobar, confirmación de costo, pedir cambios, publicar con revisión, polling de video que se detiene al desmontar |

## 9. Criterios de aceptación (estado)

| Criterio | Cómo se cubre |
|---|---|
| La story se ve 9:16 en el chat | Vista 1 (`StoryFrame`); falta el smoke manual en claude.ai |
| Aprobar se refleja en < 2 s | `update_content` + `review_content` (dos llamadas) |
| Regenerar muestra costo, pide confirmación y reemplaza la imagen sin el modelo | `RegeneratePanel` + recarga; test de UI |
| «Pedir cambios» y la tarjeta muestra el copy nuevo | `ui/message` + recarga cada 5 s hasta que cambie `updated_at` |
| Reel con video reproduce; sin video, storyboard y producir | `ReelPreview`; tests de UI |
| Producir con progreso en vivo; el polling se detiene al cerrar | Vista 2; tests con timers falsos |
| Publicar lista las cuentas reales, confirma y pasa a scheduled/published | `PublishPanel`; requiere scope `publish` (API key, no OAuth) |
| Sin MCP Apps, mismo texto | Test de regresión del texto |
| Org con 3 marcas: nunca `brand_required` | `brand_id` en cada llamada; test de ruta |
| Ningún texto se interpreta como HTML | Tests de servicio, ruta y UI con `<img onerror>` |

Pendiente: el smoke manual en claude.ai web, desktop y móvil (380 px) y en
ChatGPT (Apps SDK) para decidir si el segundo host funciona sin cambios.
