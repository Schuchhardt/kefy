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

Tablas `kefy_sales_leads`, `kefy_sales_lead_activities` y
`kefy_sales_suppressions` (migración `20261110000001`). No confundir con
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
  200 por llamada) deduplica por email e Instagram normalizados; un duplicado
  solo completa campos vacíos y suma tags.
- **Nada se envía.** El dueño escribe a mano y registra el contacto con
  `log_sales_activity` (el primer contacto saliente pasa `new → contacted`; una
  respuesta, `→ replied`). Cada lead trae `contactable` y `blocked_reason`.
- **Supresiones**: `add_sales_suppression` (email, dominio, teléfono o
  Instagram) cierra los leads abiertos que coinciden como `lost /
  do_not_contact`, bloquea registrar contacto saliente y hace que las cargas
  futuras los salten.
- `export_sales_leads` genera CSV con protección contra inyección de fórmulas.

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
