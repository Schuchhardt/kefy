-- Migration: 003 — Auth tables (kefy_users, kefy_refresh_tokens)
-- Created: 2026-05-15

CREATE TABLE IF NOT EXISTS kefy_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_users_email_idx ON kefy_users (email);

-- Refresh tokens are stored hashed for security
CREATE TABLE IF NOT EXISTS kefy_refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  token_hash  TEXT        UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_refresh_tokens_user_id_idx ON kefy_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS kefy_refresh_tokens_hash_idx ON kefy_refresh_tokens (token_hash);

-- Auto-update updated_at on kefy_users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kefy_users_updated_at
  BEFORE UPDATE ON kefy_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
