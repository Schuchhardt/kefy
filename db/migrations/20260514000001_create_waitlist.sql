-- Migration: 001 — Create waitlist table
-- Created: 2026-05-14

CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  name        TEXT,
  interest    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by email (used on duplicate check)
CREATE INDEX IF NOT EXISTS waitlist_email_idx ON waitlist (email);
