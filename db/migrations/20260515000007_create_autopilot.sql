-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6 · Autopilot — automated content scheduling rules
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE kefy_autopilot_frequency AS ENUM (
  'daily', 'weekly', 'biweekly', 'monthly'
);

CREATE TYPE kefy_autopilot_status AS ENUM (
  'active', 'paused'
);

CREATE TABLE IF NOT EXISTS kefy_autopilot_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  created_by        UUID        NOT NULL REFERENCES kefy_users(id),

  name              TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),

  -- Target channel & platform
  channel           TEXT        NOT NULL CHECK (channel IN (
                                  'linkedin','instagram','facebook',
                                  'twitter','tiktok','threads','generic'
                                )),
  -- Array of kefy_social_accounts.id this rule publishes to
  social_account_ids UUID[]     NOT NULL DEFAULT '{}',

  -- Schedule
  frequency         kefy_autopilot_frequency NOT NULL DEFAULT 'weekly',
  day_of_week       SMALLINT    CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun (used for weekly/biweekly)
  time_of_day       TIME        NOT NULL DEFAULT '09:00:00',          -- HH:MM local
  timezone          TEXT        NOT NULL DEFAULT 'UTC',

  -- Content generation hints
  ai_model          TEXT        NOT NULL DEFAULT 'claude' CHECK (ai_model IN ('claude', 'gpt')),
  tone              TEXT,
  topic_hints       TEXT[]      NOT NULL DEFAULT '{}',     -- seed topics

  -- State
  status            kefy_autopilot_status NOT NULL DEFAULT 'active',
  last_run_at       TIMESTAMPTZ,
  next_run_at       TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_autopilot_rules_org
  ON kefy_autopilot_rules (org_id, status);

CREATE INDEX IF NOT EXISTS kefy_autopilot_rules_next_run
  ON kefy_autopilot_rules (next_run_at)
  WHERE status = 'active';

-- Track each autopilot execution (for auditing and debugging)
CREATE TABLE IF NOT EXISTS kefy_autopilot_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id        UUID        NOT NULL REFERENCES kefy_autopilot_rules(id) ON DELETE CASCADE,
  org_id         UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,

  -- What was produced
  content_item_id UUID       REFERENCES kefy_content_items(id) ON DELETE SET NULL,
  scheduled_post_ids UUID[]  NOT NULL DEFAULT '{}',

  status         TEXT        NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message  TEXT,
  ran_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_autopilot_runs_rule
  ON kefy_autopilot_runs (rule_id, ran_at DESC);

-- Auto-update updated_at
CREATE TRIGGER kefy_autopilot_rules_updated_at
  BEFORE UPDATE ON kefy_autopilot_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
