# Asistente de IA, API pública y servidor MCP

Documento de referencia del asistente de Kefy y de sus puertas externas.
Leerlo antes de tocar `lib/assistant/**`, `lib/services/**`,
`app/api/assistant/**`, `app/api/v1/**`, `app/api/mcp/**` o
`app/api/api-keys/**`.

## 1. Arquitectura: tres puertas, un registro

```
  Chat del dashboard ─┐   (cookie de sesión, SSE, confirmación humana)
  API REST /api/v1 ───┼──► executeTool() ──► herramienta ──► servicio (lib/services)
  Servidor MCP /api/mcp┘   (API key)          lib/assistant/     misma lógica que las
                                               tools/*.ts         rutas de la UI
```

- **Chat** (`app/api/assistant/**`, widget `AssistantWidget`): el modelo
  (`MODELS.assistant`, `ASSISTANT_MODEL` o `claude-sonnet-5` por defecto)
  decide qué herramientas llamar. Las acciones con efectos pueden pedir
  confirmación al usuario (ver §3).
- **API REST** (`app/api/v1/**`): un cliente llama a una herramienta por su
  nombre con una API key. No hay modelo de Kefy de por medio.
- **MCP** (`app/api/mcp/route.ts` + `lib/assistant/mcp.ts`): el mismo catálogo
  expuesto como servidor MCP para Claude Code, Claude Desktop, Cursor u otro
  agente. Transporte *Streamable HTTP* sin estado y solo con respuestas JSON.

Las tres llaman a `executeTool(name, input, ctx, opts)` de
`lib/assistant/registry.ts`, que concentra lo que no puede depender de cada
herramienta, en este orden:

1. Herramienta y fuente (`open_page` solo existe en el chat) → `not_found`.
2. Marca (fuera del chat): `brand_id` del input, la marca atada a la key o la
   única marca activa de la organización → `brand_required` (400, con la
   lista de marcas), `forbidden` o `not_found`.
3. Validación zod → `invalid_input` (422, con `issues`).
4. Scopes de la API key → `scope_denied` (403).
5. Rol → `forbidden` (403).
6. Herramientas `orgWide` con una key atada a una marca → `bound_key_org_write`.
7. Todo lo que no es lectura: suscripción activa (402/503). Lo que publica,
   además, el rate limit `publish:org`.
8. Confirmación humana (solo chat).
9. Idempotencia (API/MCP con `Idempotency-Key`) y fila de auditoría en
   `kefy_assistant_actions` para toda acción que no sea lectura.
10. Ejecución. Un `ServiceError` sale tal cual; cualquier otro fallo se reporta
    a Sentry y sale como `provider_error` (502).

Las herramientas corren siempre con `brandScope: 'strict'`: solo tocan datos de
la marca del contexto, aunque la ruta equivalente de la UI filtre solo por
organización.

## 2. Contrato de una herramienta y cómo añadir una

Una herramienta es un `defineTool({...})` en `lib/assistant/tools/*.ts`:

| Campo | Qué es |
|---|---|
| `name` | `snake_case`, único. Es el nombre público en REST y MCP: no se renombra |
| `title` | `{ es, en }`, para la UI y como resumen de respaldo |
| `kind` | `read` \| `write` \| `publish`. Decide el scope que exige a una API key |
| `description` | En inglés, para el modelo: qué hace, cuándo usarla y cuántos créditos cuesta |
| `input` | `z.object(...)`. Se publica como JSON Schema (`z.toJSONSchema`) |
| `roles`, `sources`, `orgWide` | Restricciones opcionales |
| `brandless` | No actúa sobre una marca existente (`create_brand`): fuera del chat no exige `brand_id` y su JSON Schema no lo anuncia. Si llega un `brand_id`, se valida igual |
| `confirm` | `'never'` \| `'always'` \| función. Solo aplica al chat |
| `estimateCredits` | Créditos estimados; ≥ 10 fuerza la confirmación en el chat |
| `taints` | Si el resultado trae texto de terceros (ver §3) |
| `describe` | Vista previa para la tarjeta de confirmación |
| `handler(ctx, input)` | Devuelve `{ data, links?, dataChanged?, uiAction? }` |

**Pasos para añadir una herramienta:**

1. **Servicio** en `lib/services/*.ts` con firma `(ctx: ServiceContext, input)`.
   Nada de `NextRequest` ni cookies. Cargar entidades por id solo con los
   helpers de `lib/services/ownership.ts` (filtran por `org_id` y, en modo
   `strict`, por `brand_id`). Si gasta dinero, cobrar con `chargeOrThrow`
   (misma guardia que `guardAiRequest`). Errores con `ServiceError`.
2. **Herramienta** con `defineTool` en `lib/assistant/tools/<área>.ts`, añadida
   al array del módulo (que registra `lib/assistant/tools/index.ts`). El
   handler es fino: llama al servicio y arma `data` y `links`.
3. **Textos** en ambos idiomas: `toolLabels` y `toolSummaries` en
   `locales/{es,en}/dashboard/assistant.ts` (la paridad es/en se testea).
4. **Tests** del servicio y de la herramienta (`tests/unit/lib/services/**`,
   `tests/unit/lib/assistant/**`).

Si la ruta de la UI hace lo mismo, se reescribe para llamar al servicio: la
lógica nunca va duplicada ni inline en la ruta.

## 3. Confirmación y contenido no confiable (solo chat)

Una acción del chat queda **pendiente de confirmación** (tarjeta en el widget,
fila `pending_confirmation` que caduca a los 30 min) cuando:

- `confirm === 'always'` (publicar, responder DMs o comentarios, cambiar el
  perfil de marca o la estrategia) o la función `confirm` devuelve `true`;
- los créditos estimados son ≥ 10 (un carrusel con imágenes);
- el turno está **contaminado** y la acción no es de lectura;
- otra acción del mismo mensaje ya quedó pendiente y esta no es de lectura.

**Contaminación (taint).** Los DMs, comentarios y el contenido que entró por la
API/MCP los escribe un tercero. Las herramientas que los devuelven
(`list_conversations`, `get_conversation_messages`, `list_comments`, y
`list_content`/`get_content`/`list_scheduled_posts` cuando algún ítem tiene
`metadata.created_via` en `api`/`mcp` o `metadata.externally_modified`, que
`updateContent` pone en true para siempre cuando la API o MCP reescriben el
texto de un contenido creado en otro sitio) marcan el turno: mientras ese
resultado siga en la ventana del historial, toda escritura pasa por el humano.
El `tainted` de un resultado se conserva aunque se guarde recortado (`truncateJson`).
El texto de terceros se envuelve en `<untrusted_content>` (`lib/assistant/untrusted.ts`).

**La tarjeta muestra lo que se escribe o publica.** `publish_content` enseña el
texto, los hashtags y los slides que salen (los de la rendición si se pide otro
formato) y `update_content` los valores nuevos. `publish_content` además define
`snapshot`: el hash de ese texto se guarda con la acción pendiente y, si cambió
antes del clic, la confirmación falla con 409 `content_changed`.

**API y MCP no piden confirmación**: quien llama es un programa y la key ya
limita qué puede hacer (scopes). Por eso las recomendaciones de §5.

## 4. Créditos y cuotas

- **Chatear no gasta créditos.** Cada mensaje del usuario consume 1 mensaje de
  la cuota mensual del asistente (`PLAN_ASSISTANT_MESSAGES` en `lib/usage.ts`:
  Starter 300, Pro 1500, Business 5000), vía
  `guardAiRequest({ operation: 'assistant_message' })`. Un mensaje cubre hasta 6
  llamadas al modelo, también a través de las confirmaciones.
- **Lo que se genera sí cobra créditos**, igual que desde la UI: un post (texto
  1 + imagen 3), una imagen (3), un carrusel (texto + imagen por slide), un reel
  (texto + imagen por escena — y eso, multiplicado, por cada variante si se
  pide más de una con `variant_count`). Lo cobra el servicio con
  `chargeOrThrow`.
  Una story cuesta texto 1 + imagen 3; su guion de video (`prepare_story_video`) 1;
  convertir a post o story 4 y a carrusel o reel hasta 16 (`renditionCredits`).
- **Leer una web cuesta 1 crédito** (`import_brand_from_website`, y
  `create_starter_posts` cuando recibe `url`): Firecrawl extrae los datos con un
  modelo en su lado. Se devuelve si la web no se puede leer.
- **API y MCP no cobran por llamada** (no hay modelo de Kefy): solo cobran las
  herramientas que generan. `create_manual_content` no usa IA y no cuesta
  créditos, pero exige suscripción activa como todo lo que escribe.
- Rate limits: `assistant:org` (30/min, chat), `apikey:<id>` (120/min por key,
  REST y MCP juntos), `publish:org` (30/min, toda publicación) y los de
  generación (`ai:org`). Ver [`docs/beta-abierta.md`](beta-abierta.md).

## 5. API keys y scopes

Se gestionan en **Ajustes → API keys** (solo dueño y administradores) o con
`GET/POST /api/api-keys` y `DELETE /api/api-keys/{id}` (cookie de sesión).

- Formato `kefy_sk_` + 43 caracteres. Solo se guarda el hash sha256 y los 12
  primeros caracteres (`key_prefix`). **El secreto se muestra una sola vez**, en
  la respuesta de creación.
- Una key **actúa con el rol actual de quien la creó** y con el plan actual de
  la organización (se leen en cada petición). Si esa persona sale de la
  organización, la key deja de funcionar. Revocar es inmediato.
- Opcional: **marca atada** (`brand_id`): la key solo actúa sobre esa marca y no
  puede tocar datos de toda la organización (p. ej. `set_active_strategy`).
- Opcional: **caducidad** de 1 a 365 días. Máximo 10 keys activas por
  organización. Crear una exige suscripción activa.

| Scope | Permite |
|---|---|
| `read` | Herramientas de lectura: contenido, calendario, analytics, bandeja, marca y sus assets, estrategia, cuentas conectadas, link para conectar una cuenta, reglas de autopilot y de respuesta automática, leads |
| `write` | Crear y editar borradores, generar con IA (gasta créditos), convertir de formato, sincronizar, cambiar perfil/estrategia, assets, avatar, crear y archivar marcas, crear estrategias propias, desconectar cuentas, leads, borrar reglas de autopilot y de respuesta automática |
| `publish` | Publicar y programar en redes, cancelar publicaciones, responder DMs y comentarios, crear / editar / pausar / reanudar / ejecutar reglas de autopilot, crear / editar / pausar reglas de respuesta automática |

### Qué se puede hacer desde fuera (API y MCP)

| Quiero… | Herramienta | Scope |
|---|---|---|
| Ver el workspace (marcas, plan, créditos, estrategia activa) | `get_workspace_context` | read |
| Crear contenido con IA | `create_post` (`model`, `image_size`, `reference_image_urls`), `create_carousel`, `create_reel` (`reference_image_urls`), `create_story`, `generate_content_image` (`size`, `reference_image_urls`) | write |
| Convertir un contenido a otro formato (lo que después publica `publish_content` con `format`) | `convert_content_format` | write |
| Video (guion → herramientas → montaje) | `get_video_plan`, `get_video_status` (read) · `prepare_story_video` (guion de una story, 1 crédito; obligatorio antes de producirla) · `produce_video` (write, siempre con confirmación) — ver `docs/video-pipeline.md` | read / write |
| Arrancar una marca nueva: leer su web (opcional) y escribir 3 posts de inicio | `create_starter_posts` | write |
| Pasar contenido ya escrito desde otro proyecto | `create_manual_content`, `update_content` (texto, slides, estado, `image_url`, `video_url`) | write |
| Ver y buscar contenido | `list_content`, `get_content` | read |
| Publicar o programar | `publish_content`, `list_scheduled_posts`, `cancel_scheduled_post` | publish |
| Estrategias (catálogo y propias) | `get_strategy_catalog`, `preview_strategy`, `save_custom_strategy`, `set_active_strategy`, `get_content_ideas` | read / write |
| Estadísticas de contenido | `get_analytics_overview`, `list_post_performance`, `sync_social_data` | read / write |
| Cuentas conectadas | `list_social_accounts` (read) · `disconnect_social_account` (write; borra en cascada sus publicaciones, DMs y comentarios y la quita de las reglas de autopilot) | read / write |
| Conectar una cuenta nueva | `get_connect_account_link` → link directo (una persona con sesión termina el OAuth de la red) | read |
| Autopilot | `list_autopilot_rules`, `save_autopilot_rule`, `delete_autopilot_rule`, `run_autopilot_now` | read / publish / write |
| Respuestas automáticas a comentarios y DMs | `list_engagement_rules` (read), `save_engagement_rule` (publish), `delete_engagement_rule` (write) | read / publish / write |
| Leads | `list_leads` (read), `save_lead`, `delete_lead` (write) | read / write |
| Bandeja: DMs y comentarios | `list_conversations`, `get_conversation_messages`, `list_comments`, `reply_to_conversation`, `reply_to_comment` | read / publish |
| Marca: identidad | `get_brand_profile`, `update_brand_profile` (un `logo_url` externo se copia al Storage de Kefy), `import_brand_from_website` | read / write |
| Marca: assets (logos, imágenes, íconos) | `list_brand_assets` (read), `add_brand_asset` (desde una URL; `set_as_logo`), `delete_brand_asset` (write) | read / write |
| Marcas | `create_brand` (`brandless`, orgWide), `archive_brand` (solo dueño, orgWide; archiva la marca de la llamada), `set_brand_avatar` | write |

**Conectar una cuenta.** Conectar una red exige que una persona autorice en el
navegador de esa red, así que ninguna herramienta la conecta sola:
`get_connect_account_link` devuelve
`https://<host>/<lang>/dashboard/settings?connect=<red>&brand=<marca>`. Al
abrirlo con sesión, Kefy cambia a esa marca y lanza la autorización; sin
sesión, pasa por el login (`?next=`) y sigue después.

**Respuestas automáticas.** Las reglas nuevas son de la marca (`brand_id`); las
antiguas sin marca valen para toda la organización y una key atada a una marca
no puede editarlas ni borrarlas (`bound_key_org_write`). El executor
(`lib/engagement-executor.ts`) solo ejecuta los disparadores `new_comment`,
`comment_contains_keyword`, `new_dm`, `dm_contains_keyword` y las acciones
`reply_comment`, `reply_comment_ai`, `send_dm`, `send_dm_ai_response`, y se
salta las reglas con espera (`delay_minutes > 0`): la herramienta solo acepta
eso, y `list_engagement_rules` marca con `works: false` las reglas que nunca se
ejecutarían.

**Medios externos.** Toda URL de imagen o video que no sea del Storage de Kefy
(referencias, logo, assets, avatar, `update_content`) se descarga con las
protecciones de `lib/services/media-ingest.ts` y se re-aloja antes de usarla.

**Autopilot.** Las reglas son de una marca. `save_autopilot_rule` crea (sin
`id`) o edita (con `id`, incluido `status: "paused" | "active"`).
`run_autopilot_now` genera y programa ahora y cuesta 1 crédito de IA por regla
(se devuelve si falla); la ejecución programada del cron no cobra créditos por
ahora.

Recomendaciones:

- **Keys separadas** para leer y para publicar, con el mínimo de scopes.
- **Nunca des una key con `publish` a un agente que lea la bandeja** (DMs,
  comentarios): un mensaje malicioso podría convencerlo de publicar o responder
  en tu nombre, y por API/MCP no hay confirmación humana.
- Ata la key a una marca si el integrador solo trabaja con una.
- Guárdala como secreto (variable de entorno, gestor de secretos), nunca en el
  repositorio.

## 6. API REST

Base: `https://<host>/api/v1`. Autenticación: `Authorization: Bearer kefy_sk_…`.
Todas las respuestas llevan `Cache-Control: no-store`. Los mensajes salen en
inglés salvo `Accept-Language: es`.

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/api/v1/me` | `{ org: {id, name, plan}, role, scopes, key: {id, prefix}, bound_brand, brands: [{id, name}], credits: {used, limit, remaining, period} }` |
| `GET` | `/api/v1/tools` | `{ tools: [{ name, title, description, kind, input_schema }] }` — solo las que permite la key |
| `POST` | `/api/v1/tools/{name}` | `200 { ok: true, data, links? }` |

**Errores**: siempre `{ ok: false, error: { code, message }, ...detalles }` con
el estado HTTP que corresponde:

| Estado | `error.code` | Detalles |
|---|---|---|
| 400 | `invalid_json`, `invalid_idempotency_key` | |
| 400 | `brand_required` | `brands: [{id, name}]` — repetir con `brand_id` |
| 401 | `unauthorized` | Cabecera `WWW-Authenticate: Bearer realm="kefy"` |
| 402 | `subscription_required` | `subscriptionRequired`, `reason`, `status` |
| 403 | `scope_denied`, `forbidden`, `bound_key_org_write` | |
| 404 | `not_found` | Herramienta o entidad inexistente (o de otra marca) |
| 409 | `idempotency_in_progress`, `conflict` | |
| 422 | `invalid_input` | `issues: { formErrors, fieldErrors }` |
| 422 | `idempotency_mismatch` | |
| 429 | `rate_limited` | `retryAfter` + cabecera `Retry-After` |
| 429 | `credits_exhausted` | `creditsExhausted`, `limit`, `used` |
| 502 | `provider_error` | Falló la IA o la red social |
| 503 | `unavailable` | Reintentar más tarde |

Los `links` son URLs absolutas al dashboard (p. ej. para abrir el borrador).

**`brand_id`**: si la organización tiene varias marcas y la key no está atada a
una, cada llamada lleva `brand_id` en el cuerpo (`GET /api/v1/me` lista las
marcas). El JSON Schema de cada herramienta ya lo incluye.

**`Idempotency-Key`** (cabecera, 1–200 caracteres): en herramientas que escriben
o publican, repetir la misma key con la misma entrada devuelve el resultado
guardado sin volver a ejecutar; con otra entrada (u otra `brand_id`), 422 `idempotency_mismatch`;
si la primera sigue corriendo, 409 `idempotency_in_progress`. Usar una key nueva
(p. ej. un UUID) por cada operación lógica y reutilizarla solo al reintentar.
Solo se guardan los éxitos y los fallos definitivos (validación, permisos, no
encontrado). Un fallo pasajero (`rate_limited`, `credits_exhausted`,
`subscription_required`, `unavailable`, `provider_error`, cualquier 429 o 5xx)
no se repite: reintentar con la misma key vuelve a ejecutar sobre la misma fila.
Una ejecución que quedó en `running` porque el proceso murió (plazo de 10 min
en `expires_at`, `IDEMPOTENCY_LEASE_MS`) también se retoma con la misma key.

Ejemplos:

```bash
export KEFY_API_KEY=kefy_sk_...
export KEFY=https://<host>

# Qué puede hacer esta key
curl -s "$KEFY/api/v1/me" -H "Authorization: Bearer $KEFY_API_KEY"

# Catálogo de herramientas con sus JSON Schema
curl -s "$KEFY/api/v1/tools" -H "Authorization: Bearer $KEFY_API_KEY"

# Crear un borrador desde otro proyecto (sin IA, sin créditos). Las imágenes
# externas se copian al storage de Kefy.
curl -s -X POST "$KEFY/api/v1/tools/create_manual_content" \
  -H "Authorization: Bearer $KEFY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "brand_id": "<uuid de la marca>",
    "content_type": "post",
    "channel": "instagram",
    "title": "Lanzamiento de otoño",
    "body": "Llega la nueva colección…",
    "hashtags": ["otoño", "nuevacoleccion"],
    "image_url": "https://example.com/foto.jpg"
  }'

# Listar el contenido (lectura)
curl -s -X POST "$KEFY/api/v1/tools/list_content" \
  -H "Authorization: Bearer $KEFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"brand_id": "<uuid de la marca>"}'
```

## 7. Servidor MCP

URL: `https://<host>/api/mcp`, con la misma cabecera `Authorization: Bearer
kefy_sk_…` o con un access token OAuth (`kefy_at_…`, ver *OAuth* más abajo).
Transporte *Streamable HTTP* sin estado:

- Un mensaje JSON-RPC 2.0 por `POST`; la respuesta es siempre
  `application/json` (sin SSE ni `Mcp-Session-Id`). Los lotes (arrays) se
  rechazan con `-32600`.
- Métodos: `initialize` (versiones `2025-11-25`, `2025-06-18`, `2025-03-26`; si
  el cliente pide otra, se ofrece la más reciente), `ping`, `tools/list`,
  `tools/call`. Las notificaciones (`notifications/initialized`…) responden
  `202` sin cuerpo.
- La cabecera `MCP-Protocol-Version`, si viene, tiene que ser una de esas
  versiones (400 si no). Un `Origin` distinto del de la app → 403 (protección
  contra DNS rebinding). `GET` y `DELETE` → 405.
- Autenticación fallida → 401 con `WWW-Authenticate: Bearer realm="kefy",
  error="invalid_token", resource_metadata="<host>/.well-known/oauth-protected-resource/api/mcp"`
  (sin `error` si no vino cabecera). `resource_metadata` es lo que hace que un
  conector de claude.ai arranque el OAuth en vez de quedarse en «requiere
  autenticación». Rate limit → 429 con `Retry-After`.
- `tools/list` devuelve solo las herramientas que permite la key, con
  `inputSchema` y `annotations` (`readOnlyHint`, `destructiveHint` para las de
  publicar, `openWorldHint`).
- `tools/call`: éxito → `content` (texto JSON) + `structuredContent` con
  `{ data, links? }` e `isError: false`. Un error de la herramienta (validación,
  scope, suscripción, créditos, red social…) → `isError: true` con el texto
  `"<code>: <mensaje>"` y los detalles (p. ej. la lista de marcas en
  `brand_required`). Herramienta desconocida → error JSON-RPC `-32602`.
- Idempotencia: `params._meta.idempotencyKey` (string ≤ 200) funciona como la
  cabecera `Idempotency-Key` de la API REST.

### OAuth (conectores de claude.ai y clientes que sigan la especificación)

Los conectores personalizados de claude.ai no dejan pegar una cabecera: solo
conectan por OAuth. Kefy implementa lo que pide la especificación de
autorización de MCP (`lib/assistant/oauth.ts`):

| Paso | Endpoint |
|---|---|
| Metadatos del recurso (RFC 9728) | `GET /.well-known/oauth-protected-resource` y `…/oauth-protected-resource/api/mcp` |
| Metadatos del servidor (RFC 8414) | `GET /.well-known/oauth-authorization-server` |
| Registro dinámico (RFC 7591) | `POST /api/oauth/register`: solo clientes públicos (`token_endpoint_auth_method: "none"`), redirect_uris https, http en loopback o esquema de app. 20/hora por IP |
| Consentimiento | `/oauth/authorize` → `/{lang}/oauth/authorize` (sesión de Kefy; sin ella, login con `?next=`). La página habla con `GET/POST /api/oauth/consent` |
| Token | `POST /api/oauth/token`: `authorization_code` (PKCE S256 obligatorio) y `refresh_token`. 60 cada 5 min por IP |

- **Una conexión = una fila de `kefy_api_keys` con `kind = 'oauth'`.** El access
  token pasa por el mismo `authenticateApiKey` que una key: rol ACTUAL de quien
  autorizó, marca atada, scopes, rate limit, auditoría e idempotencia. Sale en
  Ajustes → API y MCP con la etiqueta «Conexión OAuth» y se revoca igual; no
  cuenta para el tope de 10 keys.
- **Tokens.** Access `kefy_at_…` (1 hora, `access_expires_at`); refresh
  `kefy_rt_…` que rota en cada uso: el anterior deja de valer en el acto. La
  conexión caduca a los 90 días sin usar (`expires_at`, se renueva en cada
  refresh). Código `kefy_ac_…`: un solo uso, 10 minutos. Solo se guardan hashes.
- **Quién autoriza.** Igual que para crear una key: dueño o administrador, con
  suscripción activa. Un miembro ve la pantalla pero no puede aprobar.
- **Permisos.** La persona elige scopes y marca en el consentimiento. Lectura y
  escritura vienen marcados; publicación nunca, aunque el cliente lo pida (por
  MCP no hay confirmación humana).
- **URLs.** Se construyen con el origen de la petición, no con `appUrl()`: el
  cliente comprueba que `resource` sea la URL a la que se conectó (con o sin
  `www`, previews). `resource` (RFC 8707) solo puede ser este servidor MCP.
- **Errores de `/oauth/authorize`.** Cliente o redirect_uri desconocidos se
  muestran en la página y no redirigen; el resto (sin PKCE, `response_type`,
  `resource` ajeno, «Cancelar») vuelven al cliente con `error=`, `state` e `iss`.

### claude.ai

Ajustes → Conectores → *Añadir conector personalizado* → URL
`https://<host>/api/mcp`, sin key. claude.ai abre la pantalla de autorización
de Kefy.

### Claude Code

```bash
claude mcp add --transport http kefy https://<host>/api/mcp \
  --header "Authorization: Bearer kefy_sk_..."
```

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "kefy": {
      "url": "https://<host>/api/mcp",
      "headers": { "Authorization": "Bearer kefy_sk_..." }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`, vía el puente stdio `mcp-remote`)

```json
{
  "mcpServers": {
    "kefy": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://<host>/api/mcp",
        "--header", "Authorization:Bearer ${KEFY_API_KEY}"
      ],
      "env": { "KEFY_API_KEY": "kefy_sk_..." }
    }
  }
}
```

(`Authorization:Bearer` va sin espacio tras los dos puntos a propósito:
algunos lanzadores parten los argumentos por espacios.)

### Otros clientes

Cualquier cliente MCP con transporte HTTP y cabeceras personalizadas sirve:
URL `https://<host>/api/mcp` y cabecera `Authorization: Bearer kefy_sk_...`. Los
que solo hablan stdio pueden usar `mcp-remote` como en Claude Desktop.

Prueba rápida sin cliente:

```bash
curl -s -X POST "$KEFY/api/mcp" \
  -H "Authorization: Bearer $KEFY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Estrategias propias

Además del catálogo (objetivo × industria), cada organización puede tener hasta
20 estrategias propias (`kefy_custom_strategies`): nombre, enfoque, KPIs,
mecánica de conversión y un calendario de hasta 12 semanas. Las crea el usuario
en `/brand/strategy` (pestaña *Personalizadas*) o el asistente con
`save_custom_strategy`, y se activan con `set_active_strategy`
(`custom_strategy_id`). Si hay una propia activa
(`kefy_org_strategies.custom_strategy_id`), manda sobre la del catálogo: las
ideas de contenido y el contexto de generación salen de su calendario.
Son de toda la org (herramientas `orgWide`, solo owner/admin).

```bash
# Crear una estrategia propia y activarla
curl -s -X POST "$KEFY/api/v1/tools/save_custom_strategy" \
  -H "Authorization: Bearer $KEFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "<uuid de la marca>",
    "name": "Café de barrio",
    "kpi_primary": "Visitas al local",
    "calendar": [
      { "week": 1, "format": "post", "channel": "instagram", "topic": "Presentamos el blend de otoño" },
      { "week": 1, "format": "reel", "topic": "Un día en la barra", "goal": "Guardados" }
    ],
    "activate": true
  }'
```

El texto de una estrategia que entró por la API o MCP es de un tercero: el
chat lo recibe envuelto en `<untrusted_content source="strategy">` y contamina
el turno (las escrituras siguientes piden confirmación).

Los links del asistente abren la página en la opción concreta:
`/brand/strategy?objective=<id>&industry=<id>` (catálogo) o `?custom=<id>`.

**Pendiente (v2):** lotes JSON-RPC y notificaciones del servidor.

## 8. Archivos

| Archivo | Qué hace |
|---|---|
| `lib/assistant/registry.ts` | `defineTool`, `listTools`, `toolJsonSchema`, `executeTool` |
| `lib/assistant/tools/*.ts` | Las herramientas, por área; `index.ts` las registra |
| `lib/assistant/api-keys.ts` | `generateApiKey`, `authenticateApiKey` (keys y access tokens OAuth), `apiToolContext` |
| `lib/assistant/oauth.ts` | OAuth 2.1 del MCP: metadatos, registro dinámico, validación de `/oauth/authorize`, códigos, canje y refresh |
| `app/.well-known/**`, `app/api/oauth/**`, `app/[lang]/oauth/authorize`, `components/auth/OAuthConsentView.tsx` | Endpoints OAuth y pantalla de consentimiento |
| `db/migrations/20261021000001_create_oauth.sql` | `kefy_oauth_clients`, `kefy_oauth_codes` y `kind = 'oauth'` en `kefy_api_keys` |
| `lib/assistant/http.ts` | `withApiKey`, `toolErrorResponse`: formato común de `/api/v1` |
| `lib/assistant/mcp.ts` | Despachador JSON-RPC puro (`handleMcpMessage`) |
| `lib/assistant/audit.ts` | Filas de `kefy_assistant_actions`: confirmaciones, idempotencia, auditoría |
| `lib/services/*.ts` | Lógica de negocio compartida con las rutas de la UI |
| `app/api/v1/**`, `app/api/mcp/route.ts` | Puertas externas (en `PUBLIC_API_PATHS` de `proxy.ts`: no aceptan cookie) |
| `app/api/api-keys/**` | Gestión de keys (cookie de sesión, dueño/admin) |
| `db/migrations/20260922000001_create_assistant_and_api_keys.sql` | Tablas y RPCs |
| `lib/services/custom-strategy.ts`, `app/api/strategies/custom/**` | Estrategias propias de la org |
| `lib/services/brand-assets.ts`, `app/api/brand-kit/assets/**` | Biblioteca de assets de la marca |
| `lib/services/brands.ts`, `app/api/brands/**` | Listar, crear y archivar marcas; avatar |
| `lib/services/story.ts`, `app/api/content/story` | Story con IA y su guion de video |
| `lib/services/renditions.ts`, `app/api/content/[itemId]/renditions` | Conversión de un contenido a otro formato |
| `lib/services/engagement.ts`, `app/api/automations/engagement/rules/**` | Reglas de respuesta automática (`lib/engagement-executor.ts` las ejecuta) |
| `lib/services/leads.ts`, `app/api/automations/leads/**` | Leads de la marca |
| `lib/services/autopilot.ts`, `app/api/autopilot/**` | Reglas y ejecución del autopilot |
| `lib/safe-redirect.ts` | `?next=` del login y del registro: solo rutas propias del idioma (dashboard, onboarding, invitación, consentimiento OAuth) |
| `lib/services/brand-enrich.ts` | Leer la web de una marca con Firecrawl (`enrichBrandFromUrl`, 1 crédito), `fillEmptyFields` (solo rellena lo vacío) e `importBrandFromWebsite`. La usan `POST /api/brand-kit/enrich-url`, el onboarding y `import_brand_from_website` |
| `lib/services/onboarding.ts`, `app/api/onboarding/starter` | «Pega tu web → 3 posts» (`createStarterPosts`): lee la web si la hay, completa lo vacío del Brand Kit y escribe 3 borradores. La usan la página `/{lang}/onboarding` y `create_starter_posts` |
| `db/migrations/20260925000001_create_custom_strategies.sql` | `kefy_custom_strategies` y `kefy_org_strategies.custom_strategy_id` |
