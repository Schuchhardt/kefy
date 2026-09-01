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
| Brand Kit | [`/memories/repo/brand-kit-architecture.md`](memories/repo/brand-kit-architecture.md) | Antes de cambios en `app/api/brand-kit/**` o `lib/brand-kit.ts` |
| Formatos y conversiones de contenido | [`docs/content-formats.md`](docs/content-formats.md) | Antes de tocar `app/api/content/[itemId]/renditions/**`, `lib/content-source.ts`, `lib/preview-layout.ts`, `lib/fonts.ts`, `lib/google-fonts.ts`, `lib/publish-images.ts`, el texto quemado en las imágenes o las previews por red |
| PWA / service worker | [`docs/pwa.md`](docs/pwa.md) | Antes de tocar `app/sw.js/**`, `lib/service-worker.ts`, `components/PwaUpdater.tsx`, `app/manifest.ts` o `scripts/generate-build-id.mjs` |
| Formato de imagen por red | [`docs/zernio.md`](docs/zernio.md) (sección *Formato de imagen por red*) | Antes de tocar `lib/image-fit.ts`, `lib/image-processor.ts` o el recorte de imágenes en las previews |

## Regla: Zernio

> **Antes de modificar cualquier cosa relacionada con Zernio o redes sociales, leer [`docs/zernio.md`](docs/zernio.md) completo.**

Puntos críticos documentados ahí:
- URL base correcta: `https://zernio.com/api/v1` (no `https://api.zernio.com/v1`)
- `GET /connect/{platform}` — la plataforma va en el **path**, no en query params
- `description: null` en `POST /profiles` causa un ZodError — omitir el campo si no tiene valor
- El callback OAuth recibe `?connected=...&accountId=...&username=...`
- 15 plataformas soportadas (ver tabla en el doc)

## Convenciones generales

- Rutas API en `app/api/**` son Route Handlers de Next.js — usar `NextRequest` / `NextResponse`
- Auth: llamar `getAuthFromRequest(req)` de `lib/auth.ts` al inicio de cada handler protegido
- DB: siempre usar `createSupabaseServer()` de `lib/supabase.ts`, nunca el cliente global
- No exponer tokens ni secrets en respuestas de la API
- Migraciones SQL en `db/migrations/` con prefijo `YYYYMMDDNNNNNN_descripcion.sql`
