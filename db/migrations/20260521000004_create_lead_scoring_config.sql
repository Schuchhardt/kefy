-- Lead scoring configuration per org
-- defaults: score delta per interaction type
-- thresholds: min score to advance from stage to stage

CREATE TABLE IF NOT EXISTS kefy_lead_scoring_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL UNIQUE REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  defaults    JSONB       NOT NULL DEFAULT '{
    "comment":  5,
    "review":   10,
    "dm":       15,
    "mention":  8,
    "follow":   3,
    "share":    12,
    "click":    2,
    "manual":   0
  }',
  thresholds  JSONB       NOT NULL DEFAULT '{
    "tibio":      20,
    "caliente":   50,
    "contactado": 70,
    "convertido": 100
  }',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
