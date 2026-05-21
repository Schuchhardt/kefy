-- Leads pipeline tables
-- kefy_leads: one row per unique (org, channel, username) contact
-- kefy_lead_interactions: timeline of every interaction that scored a lead

CREATE TABLE IF NOT EXISTS kefy_leads (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  username              TEXT        NOT NULL,
  display_name          TEXT,
  avatar_url            TEXT,
  channel               TEXT        NOT NULL,  -- instagram, facebook, tiktok, etc.
  stage                 TEXT        NOT NULL DEFAULT 'frio'
                          CHECK (stage IN ('frio', 'tibio', 'caliente', 'contactado', 'convertido')),
  score                 INT         NOT NULL DEFAULT 0,
  notes                 TEXT,
  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  contacted             BOOLEAN     NOT NULL DEFAULT FALSE,
  contacted_at          TIMESTAMPTZ,
  converted             BOOLEAN     NOT NULL DEFAULT FALSE,
  converted_at          TIMESTAMPTZ,
  first_interaction_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_interaction_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel, username)
);

CREATE INDEX IF NOT EXISTS kefy_leads_org_idx      ON kefy_leads(org_id);
CREATE INDEX IF NOT EXISTS kefy_leads_stage_idx    ON kefy_leads(org_id, stage);
CREATE INDEX IF NOT EXISTS kefy_leads_score_idx    ON kefy_leads(org_id, score DESC);

-- Individual interactions that contribute to lead scoring
CREATE TABLE IF NOT EXISTS kefy_lead_interactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES kefy_leads(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL
                    CHECK (type IN ('comment', 'review', 'dm', 'mention', 'follow', 'share', 'click', 'manual')),
  content_preview TEXT,
  post_id         TEXT,
  score_delta     INT         NOT NULL DEFAULT 0,
  rule_id         UUID        REFERENCES kefy_engagement_rules(id) ON DELETE SET NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_lead_interactions_lead_idx ON kefy_lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS kefy_lead_interactions_org_idx  ON kefy_lead_interactions(org_id, timestamp DESC);
