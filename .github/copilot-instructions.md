# Instrucciones para GitHub Copilot — Kefy

## Stack

- Next.js 15 App Router (TypeScript), Supabase, JWT auth custom, i18n con `[lang]`
- Publicación en redes sociales via **Zernio API** (`lib/zernio.ts`)

## Documentación obligatoria por área

### Zernio / Redes sociales

**Siempre leer [`docs/zernio.md`](../docs/zernio.md) antes de:**
- Modificar `lib/zernio.ts`
- Trabajar en `app/api/social/**`
- Implementar conexión OAuth, publicación de posts, o gestión de cuentas sociales

Errores frecuentes documentados ahí (base URL incorrecta, plataforma en path vs query param, `null` en campos opcionales de Zod, etc.).

### Brand Kit

Leer `/memories/repo/brand-kit-architecture.md` antes de cambios en `app/api/brand-kit/**` o `lib/brand-kit.ts`.

## Convenciones

- Auth en handlers: `getAuthFromRequest(req)` de `lib/auth.ts`
- DB: siempre `createSupabaseServer()` de `lib/supabase.ts`
- No exponer tokens ni secrets en respuestas
- Migraciones: `db/migrations/YYYYMMDDNNNNNN_descripcion.sql`
- Páginas de usuario: `app/[lang]/dashboard/`
