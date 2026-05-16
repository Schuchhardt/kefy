-- Migration: 009 — Follower snapshots per social account
-- Created: 2026-05-15
--
-- One row per account per sync call.
-- Enables follower growth trending in Analytics.

CREATE TABLE IF NOT EXISTS kefy_follower_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  social_account_id UUID        NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,

  followers_count   INT         NOT NULL DEFAULT 0,
  following_count   INT         NOT NULL DEFAULT 0,
  posts_count       INT         NOT NULL DEFAULT 0,

  measured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_follower_snapshots_org_measured
  ON kefy_follower_snapshots (org_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS kefy_follower_snapshots_account
  ON kefy_follower_snapshots (social_account_id, measured_at DESC);
