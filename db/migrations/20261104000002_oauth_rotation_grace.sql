-- ─────────────────────────────────────────────────────────────────────────────
-- OAuth del servidor MCP: margen al rotar los tokens.
--
-- Al renovar, el access y el refresh anteriores dejaban de valer en el acto.
-- Un cliente que hace dos llamadas a la vez (el modo de voz de Claude lanza la
-- herramienta y vuelve a listar el catálogo; dos herramientas en paralelo) y
-- las dos renuevan con el mismo refresh token: la primera gana y la segunda
-- recibe invalid_grant, y el cliente da la conexión por caducada. También una
-- llamada en curso con el access viejo recibía 401 si otra renovaba mientras.
--
--   prev_key_hash / prev_access_expires_at
--       El access token anterior sigue valiendo un rato tras la rotación (como
--       mucho hasta su propia caducidad, y nunca más de 10 minutos).
--   prev_refresh_hash / prev_refresh_expires_at
--       El refresh token anterior, reutilizado en los 2 minutos siguientes,
--       devuelve el MISMO par que ya se emitió (se deriva del refresh con un
--       HMAC del servidor), sin rotar otra vez. Pasado eso, invalid_grant.
--
-- Ver lib/assistant/oauth.ts (refreshAccessToken) y docs/assistant.md (OAuth).
-- Created: 2026-11-04
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE kefy_api_keys
  ADD COLUMN IF NOT EXISTS prev_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS prev_access_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prev_refresh_hash TEXT,
  ADD COLUMN IF NOT EXISTS prev_refresh_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS kefy_api_keys_prev_key_hash
  ON kefy_api_keys (prev_key_hash) WHERE prev_key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_api_keys_prev_refresh_hash
  ON kefy_api_keys (prev_refresh_hash) WHERE prev_refresh_hash IS NOT NULL;
