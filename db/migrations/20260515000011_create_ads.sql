-- Migration: 011 — Ad boosts (boost existing published posts)
-- Created: 2026-05-15
--
-- kefy_ad_boosts: records of posts boosted via Zernio ads API.
-- Supports: budget, duration, objective, and status tracking.

CREATE TYPE kefy_boost_status AS ENUM (
  'pending', 'active', 'completed', 'cancelled', 'failed'
);

CREATE TYPE kefy_boost_objective AS ENUM (
  'reach', 'engagement', 'traffic', 'leads'
);

CREATE TABLE IF NOT EXISTS kefy_ad_boosts (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID                 NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  scheduled_post_id   UUID                 NOT NULL REFERENCES kefy_scheduled_posts(id) ON DELETE CASCADE,
  social_account_id   UUID                 NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,

  -- Budget
  budget_cents        INT                  NOT NULL CHECK (budget_cents > 0),
  currency            TEXT                 NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  duration_days       SMALLINT             NOT NULL CHECK (duration_days BETWEEN 1 AND 30),

  -- Campaign settings
  objective           kefy_boost_objective NOT NULL DEFAULT 'reach',
  targeting_json      JSONB                NOT NULL DEFAULT '{}',

  -- Zernio / platform references
  zernio_boost_id     TEXT,
  platform_ad_id      TEXT,

  -- Lifecycle
  status              kefy_boost_status    NOT NULL DEFAULT 'pending',
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,

  created_by          UUID                 REFERENCES kefy_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_ad_boosts_org_idx
  ON kefy_ad_boosts (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_ad_boosts_post_idx
  ON kefy_ad_boosts (scheduled_post_id);

CREATE INDEX IF NOT EXISTS kefy_ad_boosts_status_idx
  ON kefy_ad_boosts (org_id, status);

CREATE TRIGGER kefy_ad_boosts_updated_at
  BEFORE UPDATE ON kefy_ad_boosts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
