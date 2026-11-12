# MCP de administración de la plataforma

Servidor MCP **solo para el dueño de Kefy** en `/api/admin/mcp`. Ve todas las
organizaciones, revisa logs (base, Sentry, Vercel) y lleva el pipeline
comercial para ofrecer la plataforma y/o el servicio de gestión de cuentas y
creación de contenido automatizado. Leerlo antes de tocar `lib/admin/**`,
`lib/services/admin/**`, `app/api/admin/**` o el consentimiento OAuth.

## 1. Acceso

```
claude.ai / Claude Code ──► /api/admin/mcp ──401──► /.well-known/oauth-protected-resource/api/admin/mcp
                                                       │ resource = /api/admin/mcp, scopes = [admin]
                         mismo OAuth que /api/mcp ◄────┘ (registro dinámico, /oauth/authorize, PKCE)
```

- Se reutiliza el OAuth de `docs/assistant.md` §7. Si el `resource` pedido es
  `/api/admin/mcp`, el consentimiento (`app/api/oauth/consent`) muestra la
  pantalla de admin y emite una conexión con **solo** el scope `admin`, sin
  marca. La base impide mezclar `admin` con `read`/`write`/`publish`.
- **Claude no siempre manda `resource` al autorizar** (el 2026-11-11 Claude
  Desktop no lo mandó y salió una conexión normal sin herramientas). Por eso el
  recurso admin anuncia su propio emisor, `<origen>/admin`, con metadatos en
  `/.well-known/oauth-authorization-server/admin` cuyo `authorization_endpoint`
  ya trae `resource=<origen>/api/admin/mcp`; el `iss` de la vuelta es ese
  emisor (`issuerFor`). Además, `scope=admin` sin `resource` cuenta como admin.
- Solo se emite si el email de la sesión está en `KEFY_ADMIN_EMAILS`. En cada
  petición `authenticateAdmin` (`lib/admin/auth.ts`) vuelve a comprobar el
  scope **y** la variable: quitar el email corta el acceso al instante.
- Una conexión normal recibe 403 `insufficient_scope` en el admin; una admin en
  `/api/mcp` no ve ninguna herramienta.
- La conexión aparece en Ajustes → API y MCP de la organización del admin y se
  revoca desde ahí.

**Conectarlo**: en claude.ai, *Settings → Connectors → Add custom connector*
con `https://<host>/api/admin/mcp`. En Claude Code:
`claude mcp add --transport http kefy-admin https://<host>/api/admin/mcp`.

## 2. Variables de entorno

| Variable | Para qué |
|---|---|
| `KEFY_ADMIN_EMAILS` | Emails admin, separados por comas. Sin ella nadie es admin |
| `KEFY_ADMIN_CONFIRM_SECRET` | Firma de los `confirmation_token` (si falta, `JWT_SECRET`) |
| `SENTRY_API_TOKEN` | Token con `event:read` y `project:read` (el `SENTRY_AUTH_TOKEN` de source maps no suele bastar; se usa de respaldo). Más `SENTRY_ORG`, `SENTRY_PROJECT` y, si la región no es US, `SENTRY_API_URL` (p. ej. `https://de.sentry.io`) |
| `KEFY_DEMO_ORG_ID` | Organización donde se crean las marcas demo de los prospectos (hoy Depando, en plan business). Sin ella `create_demo_brand` responde `unavailable` |
| `VERCEL_API_TOKEN` | Token de Vercel con lectura del proyecto, más `VERCEL_PROJECT_ID` (o `VERCEL_ADMIN_PROJECT_ID`) y `VERCEL_TEAM_ID` si el proyecto es de un equipo |

Sin Sentry o Vercel configurados, esas herramientas responden `unavailable`
con lo que falta; el resto funciona.

## 3. Herramientas

| Área | Herramientas |
|---|---|
| Plataforma | `get_platform_overview`, `search_organizations`, `get_organization`, `search_users` |
| Soporte (escriben, con confirmación) | `extend_trial`, `grant_credits`, `set_autopilot_rule_status`, `revoke_api_key` |
| Soporte (escriben, sin confirmación) | `add_organization_note` |
| Logs | `list_recent_failures` (base), `list_audit_log` (`assistant` o `admin`), `list_sentry_issues`, `get_sentry_issue`, `get_runtime_logs` (Vercel) |
| Demos | `create_demo_brand` (con confirmación, gasta créditos de la organización de demos), `create_demo_preview_link`, `revoke_demo_preview_link` |
| Ventas | `get_sales_pipeline`, `list_sales_leads` (`due_only` = seguimientos vencidos), `get_sales_lead`, `find_account_lead_candidates`, `import_account_leads`, `upsert_outreach_leads`, `update_sales_lead`, `log_sales_activity`, `add_sales_suppression`, `export_sales_leads` |

**Confirmación en el servidor.** Las de soporte marcadas responden primero
`{ status: "confirmation_required", summary, confirmation_token }` sin hacer
nada. El token es un HMAC del admin, la herramienta y los argumentos exactos,
vale 10 minutos y una sola vez (su hash queda único en
`kefy_admin_audit_log.confirmation_hash`).

**Auditoría.** Toda escritura deja fila en `kefy_admin_audit_log` (admin,
herramienta, entrada, `reason`, organización, estado). `extend_trial`,
`grant_credits`, `set_autopilot_rule_status` y `revoke_api_key` exigen `reason`.

**Límites a propósito.**
- `extend_trial` se niega con una suscripción viva de Stripe: el webhook la
  pisaría. Eso se cambia en Stripe.
- `grant_credits` solo vale para el mes en curso (baja el contador de usados;
  puede quedar negativo). El mes siguiente arranca en cero.
- No hay herramientas para borrar organizaciones, cambiar planes pagados ni
  publicar en nombre de un cliente.

## 4. Pipeline comercial

Tablas `kefy_sales_leads`, `kefy_sales_lead_activities`,
`kefy_sales_suppressions` y `kefy_demo_previews` (migraciones `20261110000001`,
`20261111000001` y `20261111000002`). No confundir con
`kefy_leads`, que son los leads de la marca de cada cliente.

- **Usuarios de Kefy** (`kind = kefy_account`): `find_account_lead_candidates`
  segmenta con `classifyAccount` (función pura, testeada):

  | Segmento | Cuándo | Oferta sugerida |
  |---|---|---|
  | `payment_failed` | `past_due` / `unpaid` | platform |
  | `trial_expired` | trial vencido | platform si lo usó, managed_service si no |
  | `trial_ending` | trial con ≤ 7 días | platform, o both si casi no lo usa |
  | `canceled` | cancelada | managed_service |
  | `stalled` | puede crear, ≥ 7 días de cuenta, sin redes o sin contenido en 14 días | managed_service |
  | `near_credit_limit` | ≥ 80 % de los créditos del mes | platform (upgrade); managed_service en Business |

  `import_account_leads` los pasa al pipeline con el email del dueño y el
  precio del plan como valor mensual estimado.
- **Prospección en frío** (`kind = outreach`): `upsert_outreach_leads` (hasta
  200 por llamada) deduplica por email, Instagram y **dominio del sitio**
  (`domain`, sin `www.`). Los hosts compartidos (`linktr.ee`, `instagram.com`,
  `wa.me`, `google.com`…; lista en `SHARED_HOSTS`) no cuentan como dominio. Un
  duplicado solo completa campos vacíos y suma tags, contactos y señales.
- **Ficha del prospecto**: `industry` (nicho), `city`, `source_url` (dónde se
  encontró), `priority` y `estimated_value_usd` (potencial), y dos listas JSONB:
  - `contacts` (máx. 20): personas con `name`, `role`, `email`, `phone`,
    `instagram`, `linkedin`, `source_url` (de dónde salió el dato) y `note`. Si
    el lead no trae email o teléfono propio, toma los del primer contacto. Un
    contacto repetido (mismo email, teléfono, Instagram o nombre) solo completa
    lo vacío. `update_sales_lead` usa `add_contacts` / `remove_contacts`.
  - `signals` (máx. 50): por qué es buen prospecto, `{ type, detail,
    source_url, observed_at }`. Misma `type` + `detail` = repetida.
    `update_sales_lead` usa `add_signals`.
- **Secuencia**: `log_sales_activity` acepta `sequence_step` (1 = primer toque)
  y `contact_name`; el lead guarda en `sequence_step` el paso más alto.
- **Nada se envía.** El dueño escribe a mano y registra el contacto con
  `log_sales_activity` (el primer contacto saliente pasa `new → contacted`; una
  respuesta, `→ replied`). Cada lead trae `contactable` y `blocked_reason`.
- **Supresiones**: `add_sales_suppression` (email, dominio, teléfono o
  Instagram) cierra los leads abiertos que coinciden como `lost /
  do_not_contact` (un dominio coincide con los emails `@dominio` y con el sitio
  web de la empresa); un contacto suprimido dentro de una empresa sale con su
  propio `blocked_reason` sin bloquear al resto, bloquea registrar contacto saliente y hace que las cargas
  futuras los salten.
- `export_sales_leads` genera CSV con protección contra inyección de fórmulas.

### Marca demo y vista previa pública

Lo propio de Kefy al vender: mostrarle al prospecto su negocio ya hecho.

- `create_demo_brand` (`lib/services/admin/demo-brands.ts`) crea una marca en
  la organización `KEFY_DEMO_ORG_ID` actuando como su dueño, y llama a
  `createStarterPosts` (lee la web, completa el Brand Kit y escribe 3 posts de
  texto). Usa los mismos servicios que el onboarding, así que respeta el tope
  de marcas del plan y cobra los créditos a esa organización. Guarda la marca
  en `kefy_sales_leads.demo_brand_id` y deja una nota en las actividades. Un
  lead tiene una sola demo; si quedó sin posts, se reintenta sobre la misma.
- `create_demo_preview_link` crea un link `/{lang}/demo/{token}`:
  - De la base solo se guarda el sha256 del token y sus 6 primeros caracteres.
    La URL se ve **una sola vez**.
  - Vence según `expires_in_days` (14 por defecto, máximo 90) y cuenta las
    visitas.
  - `get_sales_lead` → `demo.preview_links` muestra su estado.
  - `revoke_demo_preview_link` lo corta al instante.
- La página (`app/[lang]/demo/[token]`, servicio `lib/services/demo-preview.ts`)
  es pública y no se indexa (`noindex` y `robots.ts`):
  - Muestra solo el nombre, el tagline, el logo y los colores (solo `#hex`) de
    la marca, sus posts (imágenes solo `https://`) y un llamado a contactar.
    Nada de la organización ni del lead.
  - El título no lleva el nombre de la marca, para que no se vea en la vista
    previa del link en un chat.
- Las demos son marcas normales de la organización de demos: se ven y se editan
  entrando a Kefy con su dueño (p. ej. para generarles imágenes). Al archivar
  la marca, sus links dejan de funcionar.

## 5. Arquitectura

- `app/api/admin/mcp/route.ts`: transporte (igual que `/api/mcp`, en
  `PUBLIC_API_PATHS` de `proxy.ts`).
- `lib/admin/mcp.ts`: despachador JSON-RPC e instrucciones del servidor.
- `lib/admin/registry.ts`: `defineAdminTool`, validación zod, confirmación,
  auditoría. Mismo contrato que `lib/assistant/registry.ts` pero con
  `AdminContext` (sin organización ni marca).
- `lib/admin/tools/*.ts`: herramientas finas → `lib/services/admin/*.ts`
  (`platform.ts`, `logs.ts`, `sales-leads.ts`).
- Tests: `tests/unit/api/admin-mcp.test.ts`.

Para añadir una herramienta: servicio en `lib/services/admin`, `defineAdminTool`
en el módulo del área, test. Si escribe algo delicado, `confirm: true`,
`reason` en la entrada y `targetOrg` para la auditoría.
