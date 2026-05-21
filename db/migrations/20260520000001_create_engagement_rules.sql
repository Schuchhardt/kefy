-- Engagement automation rules
CREATE TABLE IF NOT EXISTS kefy_engagement_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  trigger_type      TEXT        NOT NULL CHECK (trigger_type IN ('new_comment','new_review','new_follower','mention')),
  condition_platform TEXT,
  condition_keyword  TEXT,
  condition_rating   SMALLINT   CHECK (condition_rating BETWEEN 1 AND 5),
  action_type       TEXT        NOT NULL CHECK (action_type IN ('reply_comment','reply_review','send_dm','like_comment')),
  action_template   TEXT        NOT NULL DEFAULT '',
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kefy_engagement_rules_org_idx ON kefy_engagement_rules(org_id);
