# Zernio API — Referencia de integración

Zernio es el servicio de publicación en redes sociales que Kefy usa como capa de abstracción sobre Instagram, LinkedIn, X/Twitter, TikTok y el resto de plataformas.

- **Base URL:** `https://zernio.com/api/v1`
- **Autenticación:** `Authorization: Bearer <ZERNIO_API_KEY>`
- **Env var requerida:** `ZERNIO_API_KEY`
- **Env var opcional:** `ZERNIO_API_URL` (sobreescribe la base URL; útil para staging)

---

## Plataformas soportadas

| Identificador    | Plataforma       | Conexión        |
|------------------|------------------|-----------------|
| `facebook`       | Facebook         | OAuth 2.0       |
| `instagram`      | Instagram        | OAuth 2.0       |
| `linkedin`       | LinkedIn         | OAuth 2.0       |
| `twitter`        | X / Twitter      | OAuth 2.0       |
| `tiktok`         | TikTok           | OAuth 2.0       |
| `youtube`        | YouTube          | OAuth 2.0       |
| `threads`        | Threads          | OAuth 2.0       |
| `reddit`         | Reddit           | OAuth 2.0       |
| `pinterest`      | Pinterest        | OAuth 2.0       |
| `bluesky`        | Bluesky          | App Password    |
| `googlebusiness` | Google Business  | OAuth 2.0       |
| `telegram`       | Telegram         | Bot Token       |
| `snapchat`       | Snapchat         | OAuth 2.0       |
| `discord`        | Discord          | OAuth 2.0 (Bot) |
| `whatsapp`       | WhatsApp         | Redirect / Creds|

> **Nota:** X/Twitter requiere método de pago en Zernio para conectar más de 2 cuentas (pasa a través de los costes de la API de X).

---

## Perfiles

Los perfiles agrupan cuentas sociales. En Kefy, **cada organización (marca) corresponde a un perfil de Zernio**. El `_id` del perfil se guarda en `kefy_organizations.zernio_profile_id`.

### Crear perfil

```
POST /v1/profiles
```

**Body:**
```json
{
  "name": "Mi Marca",
  "description": "opcional",
  "color": "#4CAF50"
}
```

**Respuesta 201:**
```json
{
  "message": "Profile created successfully",
  "profile": {
    "_id": "64f0a1b2c3d4e5f6a7b8c9d0",
    "userId": "...",
    "name": "Mi Marca",
    "description": "...",
    "color": "#4CAF50",
    "isDefault": false,
    "createdAt": "2024-11-01T10:00:00Z"
  }
}
```

> ⚠️ `description` y `color` son opcionales — **no enviar `null`**, omitir el campo directamente o Zod lo rechaza con `invalid_type`.

### Listar perfiles

```
GET /v1/profiles
```

Query params opcionales: `includeOverLimit=true`

**Respuesta 200:**
```json
{
  "profiles": [
    { "_id": "64f0...", "name": "Personal Brand", "color": "#ffeda0", "isDefault": true }
  ]
}
```

---

## Conexión de cuentas (OAuth)

El flujo tiene dos pasos: obtener la URL de autorización y, opcionalmente, gestionar el callback.

### Paso 1 — Obtener URL de autorización

```
GET /v1/connect/{platform}
```

**Path param:** `platform` — uno de los identificadores de la tabla de arriba.

**Query params:**

| Param          | Tipo    | Requerido | Descripción |
|----------------|---------|-----------|-------------|
| `profileId`    | string  | ✅        | ID del perfil de Zernio (`_id`) |
| `redirect_url` | string  | ❌        | URL de tu app a la que Zernio redirige tras la autorización |
| `headless`     | boolean | ❌        | `true` para modo headless (ver abajo). Default: `false` |

**Respuesta 200:**
```json
{
  "authUrl": "https://www.instagram.com/oauth/authorize?...",
  "state": "user123-profile456-1234567890-https://tuapp.com/callback"
}
```

Redirigir al usuario a `authUrl`.

#### Modos de callback

**Modo estándar** (por defecto, `headless=false`):
- Zernio muestra su propia UI de selección de cuenta.
- Tras la autorización redirige a `redirect_url` con:
  ```
  ?connected={platform}&profileId=X&accountId=Y&username=Z
  ```
- La cuenta ya está creada en Zernio. Solo guardar `accountId` localmente.

**Modo headless** (`headless=true`):
- Zernio redirige a `redirect_url` con los datos OAuth crudos (`code`, `state`).
- Útil para builds de UI personalizada.
- Requiere llamar al endpoint de callback manualmente (ver paso 2).

### Paso 2 — Completar callback (solo headless)

```
POST /v1/connect/{platform}
```

**Body:**
```json
{
  "code": "abc123",
  "state": "...",
  "profileId": "profile_abc123"
}
```

No devuelve body en 200. La cuenta queda conectada al perfil.

---

## Cuentas conectadas

### Listar cuentas

```
GET /v1/accounts
```

**Query params opcionales:**

| Param              | Tipo    | Descripción |
|--------------------|---------|-------------|
| `profileId`        | string  | Filtra por perfil |
| `platform`         | string  | Filtra por plataforma |
| `includeOverLimit` | boolean | Incluye cuentas fuera del límite del plan |
| `page`             | integer | Paginación (1-based) |
| `limit`            | integer | Tamaño de página (máx. 100) |

**Respuesta 200:**
```json
{
  "accounts": [
    {
      "_id": "64e1...",
      "platform": "twitter",
      "profileId": { "_id": "64f0...", "name": "Mi Marca", "slug": "mi-marca" },
      "username": "@acme",
      "displayName": "Acme",
      "profileUrl": "https://x.com/acme",
      "isActive": true
    }
  ],
  "hasAnalyticsAccess": false
}
```

### Desconectar cuenta

```
DELETE /v1/accounts/{accountId}
```

**Respuesta 200:**
```json
{ "message": "Account disconnected successfully" }
```

---

## Posts

### Crear / publicar post

```
POST /v1/posts
```

**Header opcional:** `x-request-id: <uuid>` — para idempotencia (reintentos seguros en 5 min).

**Body principal:**

| Campo           | Tipo     | Descripción |
|-----------------|----------|-------------|
| `content`       | string   | Texto / caption. Requerido en posts de solo texto |
| `platforms`     | array    | Cuentas destino: `[{ platform, accountId }]` |
| `publishNow`    | boolean  | `true` para publicar inmediatamente |
| `scheduledFor`  | datetime | ISO 8601 para programar |
| `isDraft`       | boolean  | Guarda como borrador |
| `mediaItems`    | array    | Imágenes/vídeos: `[{ type: "image"|"video", url }]` |
| `hashtags`      | array    | Hashtags a añadir |
| `tags`          | array    | Tags internos (YouTube: máx 100 chars/tag, 500 total) |
| `timezone`      | string   | Default: `"UTC"` |

**Respuesta 201:**
```json
{
  "post": {
    "_id": "65f1c0a9...",
    "content": "Texto del post",
    "status": "scheduled",
    "scheduledFor": "2024-11-01T10:00:00Z",
    "platforms": [
      { "platform": "twitter", "accountId": { "_id": "...", "username": "@acme" }, "status": "pending" }
    ]
  },
  "message": "Post scheduled successfully"
}
```

**Deduplicación de contenido:** Zernio rechaza con `409` si se envía el mismo contenido + cuenta en las últimas 24 horas.

### Listar posts

```
GET /v1/posts
```

Query params: `profileId`, `platform`, `status`, `page`, `limit`.

### Eliminar / cancelar post

```
DELETE /v1/posts/{postId}
```

---

## Analytics

### Métricas de un post individual

```
GET /v1/analytics?postId={zernioPostId}
```

Acepta tanto Zernio Post IDs como External Post IDs. Puede devolver `202` si la sincronización de métricas sigue pendiente en el lado de Zernio.

**Respuesta 200:**
```json
{
  "postId": "65f1c0a9...",
  "analytics": {
    "impressions": 15420,
    "reach": 12350,
    "likes": 342,
    "comments": 28,
    "shares": 45,
    "saves": 0,
    "clicks": 189,
    "views": 0,
    "engagementRate": 2.78,
    "lastUpdated": "2024-11-02T08:30:00Z"
  }
}
```

### Instagram — Account Insights

```
GET /v1/analytics/instagram/account-insights
```

Métricas **a nivel de cuenta** (no por post). Requiere el add-on Analytics en el plan de Zernio.

| Param | Tipo | Descripción |
|---|---|---|
| `accountId` | string | Zernio SocialAccount ID (requerido) |
| `metrics` | string | Comma-separated. Default: `reach,views,accounts_engaged,total_interactions`. Válidos: `reach, views, accounts_engaged, total_interactions, comments, likes, saves, shares, replies, reposts, follows_and_unfollows, profile_links_taps` |
| `since` | date (YYYY-MM-DD) | Inicio del período. Default: 30 días atrás |
| `until` | date (YYYY-MM-DD) | Fin del período. Default: hoy |
| `metricType` | `total_value` \| `time_series` | Solo `reach` soporta `time_series`. Default: `total_value` |
| `breakdown` | string | Solo válido con `total_value`: `media_product_type`, `follow_type`, `follower_type`, `contact_button_type` |

Máximo 90 días. Los datos pueden retrasarse hasta 48 horas.

**Respuesta 200:**
```json
{
  "success": true,
  "accountId": "64e1a2b3c4d5e6f7a8b9c0d1",
  "platform": "instagram",
  "dateRange": { "since": "2026-03-01", "until": "2026-03-22" },
  "metricType": "total_value",
  "metrics": {
    "reach": { "total": 12500 },
    "views": { "total": 45000 }
  },
  "dataDelay": "Data may be delayed up to 48 hours"
}
```

### Follower stats (todas las plataformas)

```
GET /v1/accounts/follower-stats
```

| Param | Tipo | Descripción |
|---|---|---|
| `accountIds` | string | Comma-separated Zernio account IDs |
| `profileId` | string | Filtra por perfil |
| `fromDate` | date | YYYY-MM-DD |
| `toDate` | date | YYYY-MM-DD |
| `granularity` | `daily` \| `weekly` \| `monthly` | Default: `daily` |

**Respuesta 200:**
```json
{
  "accounts": [
    { "_id": "64e1...", "platform": "twitter", "username": "@acme", "currentFollowers": 1250, "growth": 50, "growthPercentage": 4.17 }
  ],
  "stats": { "64e1...": [{ "date": "2024-01-01", "followers": 1200 }] },
  "dateRange": { "from": "...", "to": "..." },
  "granularity": "daily"
}
```

> ⚠️ Este endpoint **no** devuelve `following_count` ni `posts_count` — solo `currentFollowers`. Las columnas correspondientes en `kefy_follower_snapshots` se guardan como `0`.

---

## Inbox / Mensajes directos

### Listar conversaciones

```
GET /v1/inbox/conversations
```

Obtiene conversaciones (DMs) de **todas las cuentas de mensajería conectadas** en una sola llamada. Los resultados se agregan y deduplictan.

**Plataformas soportadas:** Facebook, Instagram, Twitter/X, Bluesky, Reddit, Telegram.

> ⚠️ **Limitación de Twitter/X:** X ha reemplazado los DMs tradicionales con "X Chat" cifrado en muchas cuentas. Los mensajes de X Chat cifrado **no son accesibles vía API** — solo devuelve DMs legacy sin cifrar. Algunas conversaciones de Twitter/X pueden aparecer vacías. Es una limitación de la plataforma, no de Zernio.

**Query params:**

| Param       | Tipo    | Requerido | Default  | Descripción |
|-------------|---------|-----------|----------|-------------|
| `profileId` | string  | ❌        | —        | Filtra por profile ID de Zernio |
| `platform`  | string  | ❌        | —        | `"facebook" \| "instagram" \| "twitter" \| "bluesky" \| "reddit" \| "telegram"` |
| `status`    | string  | ❌        | —        | `"active" \| "archived"` |
| `sortOrder` | string  | ❌        | `"desc"` | Orden por `updatedTime`: `"asc" \| "desc"` |
| `limit`     | integer | ❌        | `50`     | Máx. 100 conversaciones |
| `cursor`    | string  | ❌        | —        | Cursor de paginación para la página siguiente |
| `accountId` | string  | ❌        | —        | Filtra por ID de cuenta social de Zernio |

**Respuesta 200:**
```json
{
  "data": [
    {
      "id": "conv_abc123",
      "platform": "instagram",
      "accountId": "64e1a2b3c4d5e6f7a8b9c0d1",
      "accountUsername": "@mi_marca",
      "participantId": "user_456",
      "participantName": "María García",
      "participantPicture": "https://cdn.instagram.com/...",
      "participantVerifiedType": "blue",
      "lastMessage": "Hola, quiero saber más sobre...",
      "updatedTime": "2026-05-20T10:00:00Z",
      "status": "active",
      "unreadCount": 2,
      "url": "https://instagram.com/direct/...",
      "instagramProfile": {
        "isFollower": true,
        "isFollowing": false,
        "followerCount": 1500,
        "isVerified": false,
        "fetchedAt": "2026-05-20T09:55:00Z"
      }
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJsYXN0SWQiOiJjb252X3h5eiJ9"
  },
  "meta": {
    "accountsQueried": 3,
    "accountsFailed": 0,
    "failedAccounts": [],
    "lastUpdated": "2026-05-20T10:00:00Z"
  }
}
```

**Campos clave de cada conversación:**

| Campo                    | Tipo    | Descripción |
|--------------------------|---------|-------------|
| `id`                     | string  | ID de conversación en Zernio |
| `platform`               | string  | Plataforma de origen |
| `accountId`              | string  | Zernio account ID de la cuenta que recibió el mensaje |
| `accountUsername`        | string  | Username de la cuenta conectada |
| `participantId`          | string  | ID del contacto en la plataforma |
| `participantName`        | string  | Nombre del contacto |
| `participantPicture`     | string  | URL del avatar del contacto |
| `participantVerifiedType`| string  | `"blue"` si el contacto está verificado |
| `lastMessage`            | string  | Texto del último mensaje (preview) |
| `updatedTime`            | string  | ISO 8601 — última actividad en el hilo |
| `status`                 | string  | `"active"` o `"archived"` |
| `unreadCount`            | integer | Mensajes no leídos en esta conversación |
| `url`                    | string  | URL directa a la conversación en la plataforma |
| `instagramProfile`       | object  | Solo Instagram: `isFollower`, `isFollowing`, `followerCount`, `isVerified` |

**Campos de `meta`:**

| Campo             | Tipo    | Descripción |
|-------------------|---------|-------------|
| `accountsQueried` | integer | Cuentas consultadas |
| `accountsFailed`  | integer | Cuentas con error |
| `failedAccounts`  | array   | Detalle de errores: `accountId`, `platform`, `error`, `code`, `retryAfter` |
| `lastUpdated`     | string  | ISO 8601 — cuándo se hizo la última consulta |

> 💡 Usar `profileId` para limitar el scope al perfil de la org activa. Usar `sortOrder=desc&limit=100` para obtener las conversaciones más recientes.

---

### Listar mensajes de una conversación

```
GET /v1/inbox/conversations/{conversationId}/messages
```

Devuelve los mensajes de una conversación específica. No marca como leídos — usar `POST /v1/inbox/conversations/{conversationId}/read` para eso.

**Path params:**

| Param            | Tipo   | Descripción |
|------------------|--------|-------------|
| `conversationId` | string | El `id` de la conversación (del endpoint de listar conversaciones) |

**Query params:**

| Param       | Tipo    | Requerido | Default  | Descripción |
|-------------|---------|-----------|----------|-------------|
| `accountId` | string  | ✅        | —        | Zernio account ID de la cuenta conectada |
| `limit`     | integer | ❌        | `100`    | Máx. 100 mensajes por página |
| `cursor`    | string  | ❌        | —        | Cursor opaco de paginación |
| `sortOrder` | string  | ❌        | `"asc"`  | `"asc"` (más antiguos primero) \| `"desc"` |

**Respuesta 200:**
```json
{
  "status": "ok",
  "pagination": { "hasMore": false, "nextCursor": null },
  "sortOrderApplied": "asc",
  "messages": [
    {
      "id": "msg_abc123",
      "conversationId": "conv_xyz",
      "accountId": "64e1a2b3c4d5e6f7a8b9c0d1",
      "platform": "instagram",
      "message": "Hola, quiero información",
      "senderId": "user_456",
      "senderName": "María García",
      "direction": "incoming",
      "createdAt": "2026-05-20T10:00:00Z",
      "attachments": []
    }
  ],
  "lastUpdated": "2026-05-20T10:01:00Z"
}
```

> **Nota:** `direction` usa `"incoming"` / `"outgoing"` (Zernio), que Kefy mapea a `"inbound"` / `"outbound"` al guardar en BD.

---

### Enviar mensaje en una conversación

```
POST /v1/inbox/conversations/{conversationId}/messages
```

Envía un mensaje en una conversación de inbox. Es el endpoint correcto para responder DMs. **No usar** `/accounts/{id}/messages/{threadId}/reply` para conversaciones de inbox.

**Path params:**

| Param            | Tipo   | Descripción |
|------------------|--------|-------------|
| `conversationId` | string | El `id` de la conversación |

**Body:**
```json
{
  "accountId": "64e1a2b3c4d5e6f7a8b9c0d1",
  "message": "Texto del mensaje"
}
```

**Respuesta 201:**
```json
{
  "messageId": "msg_xyz789",
  "conversationId": "conv_xyz",
  "message": "Texto del mensaje"
}
```

---

## Cómo está implementado en Kefy

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Cliente HTTP | `lib/zernio.ts` | Todas las llamadas a la API de Zernio |
| Obtener URL OAuth | `app/api/social/oauth/url/route.ts` | Crea perfil Zernio si no existe; llama `GET /connect/{platform}` |
| Callback OAuth | `app/api/social/oauth/callback/route.ts` | Recibe `?connected=...&accountId=...` y guarda en DB |
| Listar / desconectar cuentas | `app/api/social/accounts/route.ts` | `GET` lista de DB; `POST` conecta via código OAuth (headless) |
| Publicar | `app/api/social/publish/route.ts` | Llama `POST /v1/posts` |
| Sync inbox | `app/api/messaging/sync/route.ts` | Llama `GET /v1/inbox/conversations?sortOrder=desc&limit=100` y hace upsert en `kefy_messages` |
| Ver historial mensajes | `app/api/messaging/[threadId]/route.ts` (GET) | Al abrir un hilo, llama `GET /v1/inbox/conversations/{id}/messages` y hace upsert en `kefy_messages` |
| Responder mensaje | `app/api/messaging/[threadId]/route.ts` (POST) | Llama `POST /v1/inbox/conversations/{id}/messages` con `{ accountId, message }` |

### Mapa de datos: Zernio ↔ Kefy DB

| Campo Zernio | Campo en `kefy_social_accounts` |
|---|---|
| `_id` (account) | `zernio_account_id` |
| `platform` | `platform` |
| `username` | `username` |
| `_id` (profile) | `kefy_organizations.zernio_profile_id` |

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Platform not supported` | `platform` enviado como query param en lugar de path param | Usar `GET /connect/{platform}` |
| `Authorization code required` | Llamada a `POST /connect/{platform}` sin `code` | Solo usar POST en modo headless con código real |
| `ZodError: description invalid_type` | Campo `description: null` enviado en POST /profiles | Omitir el campo si no tiene valor |
| `[object Object]` en error | `errBody.message` es un objeto, no string | `zernioFetch` ya lo maneja con `JSON.stringify` |
| `402 PAYMENT_REQUIRED` | X/Twitter supera el límite gratuito | Añadir método de pago en el dashboard de Zernio |
