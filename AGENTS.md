# Guía para agentes de IA — Kefy

Este archivo describe las convenciones del proyecto y los documentos de referencia que todo agente debe consultar antes de trabajar en áreas específicas del código.

## Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Base de datos:** Supabase (PostgreSQL) — cliente en `lib/supabase.ts`
- **Auth:** JWT custom (`lib/auth.ts`) — cookies `kefy_access` / `kefy_refresh`
- **i18n:** Parámetro `[lang]` (`es` / `en`) — todas las páginas de usuario bajo `app/[lang]/`
- **Publicación social:** Zernio API — cliente en `lib/zernio.ts`
- **Email:** Resend
- **Video:** Remotion — composiciones en `remotion/`

## Documentos de referencia obligatorios

| Área | Documento | Cuándo leerlo |
|------|-----------|----------------|
| Zernio / redes sociales | [`docs/zernio.md`](docs/zernio.md) | Antes de cualquier cambio en `lib/zernio.ts`, `app/api/social/**`, o cualquier flujo de conexión/publicación en redes sociales |
| Render de reels / stories | [`docs/reel-render.md`](docs/reel-render.md) | Antes de tocar `app/api/content/reel/render/**`, `app/api/content/reel/reconcile/**`, `lib/reel-render.ts`, `remotion/**` o `MuxReelPlayer` |
| Brand Kit | [`docs/brand-kit.md`](docs/brand-kit.md) (y, si tu entorno la tiene, la memoria [`/memories/repo/brand-kit-architecture.md`](memories/repo/brand-kit-architecture.md)) | Antes de cambios en `app/api/brand-kit/**`, `lib/brand-kit.ts`, `lib/brand-setup.ts`, `lib/services/brand-*.ts`, `lib/services/onboarding.ts` o `components/dashboard/BrandKitWizard.tsx` |
| Formatos y conversiones de contenido | [`docs/content-formats.md`](docs/content-formats.md) | Antes de tocar `app/api/content/[itemId]/renditions/**`, `lib/content-source.ts`, `lib/preview-layout.ts`, `lib/fonts.ts`, `lib/google-fonts.ts`, `lib/publish-images.ts`, el texto quemado en las imágenes o las previews por red |
| PWA / service worker | [`docs/pwa.md`](docs/pwa.md) | Antes de tocar `app/sw.js/**`, `lib/service-worker.ts`, `components/PwaUpdater.tsx`, `app/manifest.ts` o `scripts/generate-build-id.mjs` |
| Formato de imagen por red | [`docs/zernio.md`](docs/zernio.md) (sección *Formato de imagen por red*) | Antes de tocar `lib/image-fit.ts`, `lib/image-processor.ts` o el recorte de imágenes en las previews |
| Beta abierta: créditos, trial, rate limiting y Sentry | [`docs/beta-abierta.md`](docs/beta-abierta.md) | Antes de tocar `lib/rate-limit.ts`, `lib/usage.ts`, `lib/ai-guard.ts`, `lib/subscription.ts`, `lib/observability.ts`, `lib/sentry-scrub.ts`, los planes, o **al añadir cualquier ruta que gaste dinero** (IA, render, envío de correo) |
| Landing, auth y UX mobile del dashboard | [`docs/auditoria-ux.md`](docs/auditoria-ux.md) | Antes de tocar `components/landing/**`, `locales/*/landing.ts`, las páginas de auth, el onboarding o el layout/mobile del dashboard: lista lo que la landing no puede prometer, qué se implementó de la auditoría y las métricas que vigilan los tests |
| Idiomas | [`docs/i18n.md`](docs/i18n.md) | Antes de añadir textos de interfaz o tocar `locales/**` |
| Asistente / API pública / MCP | [`docs/assistant.md`](docs/assistant.md) | Antes de tocar `lib/assistant/**`, `lib/services/**`, `app/api/assistant/**`, `app/api/v1/**`, `app/api/mcp/**` o `app/api/api-keys/**` |

## Regla: Zernio

> **Antes de modificar cualquier cosa relacionada con Zernio o redes sociales, leer [`docs/zernio.md`](docs/zernio.md) completo.**

Puntos críticos documentados ahí:
- URL base correcta: `https://zernio.com/api/v1` (no `https://api.zernio.com/v1`)
- `GET /connect/{platform}` — la plataforma va en el **path**, no en query params
- `description: null` en `POST /profiles` causa un ZodError — omitir el campo si no tiene valor
- El callback OAuth recibe `?connected=...&accountId=...&username=...`
- 15 plataformas soportadas (ver tabla en el doc)

## Regla: rutas que gastan dinero

> **Toda ruta nueva que llame a un proveedor de IA, dispare un render o envíe
> correo tiene que pasar por `guardAiRequest` (`lib/ai-guard.ts`).**

Sin ese paso la ruta queda sin verificación de suscripción, sin rate limit y sin
créditos: en beta abierta eso es gasto ilimitado en Anthropic, OpenAI, Remotion
Lambda o Resend para cualquiera que se registre — incluso con el mes gratis ya
vencido. Las rutas que no gastan créditos pero sí son «crear» (publicar,
programar) usan `requireActiveSubscription` de `lib/subscription.ts`.
Ver [`docs/beta-abierta.md`](docs/beta-abierta.md).

## Regla: capacidades nuevas

> **La lógica va en un servicio de `lib/services` (`(ctx, input)`) y se expone
> como herramienta en `lib/assistant/tools`; las rutas solo adaptan HTTP.
> Nunca lógica inline en la ruta.**

Así la misma capacidad sirve a la UI, al chat del asistente, a la API REST
(`/api/v1`) y al servidor MCP (`/api/mcp`) con las mismas reglas de marca,
suscripción, créditos y auditoría. Ver [`docs/assistant.md`](docs/assistant.md).

## Regla: interfaz

> **Usa las piezas de `components/ui` y los tokens de `app/globals.css`; no
> reinventes modales, botones ni colores.**

- `Modal` (el único modal: foco atrapado, Escape, hoja inferior en móvil),
  `useConfirm` en vez de `window.confirm`, `Button`/`ButtonLink`, `Field` +
  `Input`/`Select`/`Textarea` (etiqueta, ayuda y error conectados), `Notice`,
  `EmptyState`, `SectionCard`, `StatusBadge`, `Icon` (nada de emojis ni
  caracteres como iconos).
- Colores solo con tokens (`--text`, `--muted`, `--accent`, `--accent-text`
  para texto de acento, `--on-accent` sobre el acento, `--danger`…): hay tema
  claro y oscuro y los dos pasan axe.
- Páginas del dashboard con `.page` / `.page-header`; rejillas con `.auto-grid`
  o `.grid-2`, nunca `repeat(3, 1fr)` fijos. Inputs a 16px (si no, iOS hace
  zoom) y objetivos táctiles de 44px (visibles de 36 como mínimo, con el área
  ampliada por pseudo-elemento; ver `.ui-btn--sm`).
- `tests/e2e/mobile-a11y.spec.ts` comprueba que no haya scroll horizontal a
  390 y 320px y que axe (WCAG 2.x A/AA) no encuentre nada en landing, auth y
  dashboard, en los dos temas.

## Convenciones generales

- Rutas API en `app/api/**` son Route Handlers de Next.js — usar `NextRequest` / `NextResponse`
- Auth: llamar `getAuthFromRequest(req)` de `lib/auth.ts` al inicio de cada handler protegido
- DB: siempre usar `createSupabaseServer()` de `lib/supabase.ts`, nunca el cliente global
- No exponer tokens ni secrets en respuestas de la API
- Migraciones SQL en `db/migrations/` con prefijo `YYYYMMDDNNNNNN_descripcion.sql`
- Errores atrapados en un `try/catch` que devuelven 4xx/5xx: reportar con
  `reportError` de `lib/observability.ts`, no solo `console.error` — en
  producción nadie lee los logs
- **No hay plan gratuito.** Toda cuenta nueva entra en `starter` con el primer
  mes gratis (`kefy_subscriptions.status = 'trialing'`). El plan decide cuántos
  créditos y marcas tocan; el `status` decide si se puede crear. No confundirlos
- Los créditos, las marcas y los miembros de `lib/usage.ts`, `lib/brands.ts` y
  `lib/team.ts` son los que anuncia la landing (`locales/es|en/landing.ts`): si
  cambian en un sitio, cambian en el otro. Lo verifican
  `tests/unit/lib/usage.test.ts` y `tests/unit/lib/team.test.ts`
- **La landing solo puede prometer lo que existe.** Antes anunciaba formatos que
  el producto no genera, packs de créditos sin flujo de compra y testimonios de
  personas inventadas. `tests/unit/locales/parity.test.ts` cubre la paridad
  es/en y vigila que no se reintroduzcan formatos inexistentes
