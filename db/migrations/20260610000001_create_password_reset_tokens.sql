-- Migration: create_password_reset_tokens
-- Created: 2026-06-10

CREATE TABLE IF NOT EXISTS kefy_password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  token_hash  TEXT        UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_prt_user_id_idx  ON kefy_password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS kefy_prt_hash_idx     ON kefy_password_reset_tokens (token_hash);
