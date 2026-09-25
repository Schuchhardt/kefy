-- Migration: invalidación de sesiones por organización
-- Necesaria para que grant-comp-plan.ts pueda forzar un re-login: el access
-- token (kefy_access) es un JWT sin estado — se verifica solo por firma y
-- expiración, hasta 24h (ACCESS_TOKEN_TTL_HOURS) — así que cambiar el plan en
-- la base no lo actualiza hasta que el usuario cierre sesión o el token rote
-- solo. `session_invalidated_at` es la marca que usa GET /api/auth/me para
-- rechazar cualquier token emitido ANTES de esa marca (compara contra el
-- `iat` del JWT), aunque el token todavía no haya expirado.
-- Created: 2026-09-25

ALTER TABLE kefy_organizations
  ADD COLUMN IF NOT EXISTS session_invalidated_at TIMESTAMPTZ;
