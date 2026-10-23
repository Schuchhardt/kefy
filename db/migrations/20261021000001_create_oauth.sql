-- Migration: OAuth 2.1 para el servidor MCP (/api/mcp)
--
-- Los conectores de claude.ai (y otros clientes MCP) no aceptan una API key
-- pegada a mano: descubren el servidor de autorización por los metadatos de
-- /.well-known/oauth-protected-resource, se registran solos (RFC 7591) y piden
-- a la persona que autorice en el navegador (código + PKCE).
--
--   * kefy_oauth_clients: clientes registrados dinámicamente. Son públicos (sin
--     secreto): lo que protege el intercambio es PKCE y la redirect_uri exacta.
--   * kefy_oauth_codes: códigos de autorización, de un solo uso y 10 minutos.
--     Solo se guarda el hash.
--   * kefy_api_keys gana kind = 'oauth': cada autorización aprobada es una fila
--     más de la tabla de keys. Así el token OAuth pasa por el mismo
--     authenticateApiKey (rol actual del creador, marca atada, rate limit) y
--     comparte auditoría e idempotencia (kefy_assistant_actions.api_key_id), y
--     se revoca desde Ajustes como cualquier key.
--       - key_hash es el hash del access token vigente (rota en cada refresh).
--       - access_expires_at: caducidad del access token (1 hora).
--       - refresh_hash: hash del refresh token vigente (rota en cada uso).
--       - expires_at: caducidad de la conexión; se renueva con cada refresh.
-- Created: 2026-10-21

CREATE TABLE IF NOT EXISTS kefy_oauth_clients (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name    TEXT        NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 100),
  redirect_uris  TEXT[]      NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kefy_oauth_codes (
  code_hash       TEXT        PRIMARY KEY,
  client_id       UUID        NOT NULL REFERENCES kefy_oauth_clients(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  brand_id        UUID        REFERENCES kefy_brands(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  scopes          TEXT[]      NOT NULL
                              CHECK (cardinality(scopes) > 0
                                     AND scopes <@ ARRAY['read','write','publish']::TEXT[]),
  redirect_uri    TEXT        NOT NULL,
  code_challenge  TEXT        NOT NULL,
  resource        TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_oauth_codes_expires_idx
  ON kefy_oauth_codes (expires_at);

ALTER TABLE kefy_api_keys
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'key' CHECK (kind IN ('key', 'oauth')),
  -- SET NULL y no CASCADE: borrar un cliente no puede llevarse la auditoría.
  ADD COLUMN IF NOT EXISTS oauth_client_id UUID REFERENCES kefy_oauth_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_hash TEXT UNIQUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kefy_api_keys_oauth_shape'
  ) THEN
    ALTER TABLE kefy_api_keys
      ADD CONSTRAINT kefy_api_keys_oauth_shape
      CHECK (kind = 'key' OR (access_expires_at IS NOT NULL AND refresh_hash IS NOT NULL));
  END IF;
END $$;
