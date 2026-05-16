-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5 · Analytics — post metrics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_post_metrics (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  scheduled_post_id UUID        NOT NULL REFERENCES kefy_scheduled_posts(id) ON DELETE CASCADE,

  -- Snapshot timestamp (one row per sync call per post)
  measured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Engagement counters
  impressions       INT         NOT NULL DEFAULT 0,
  reach             INT         NOT NULL DEFAULT 0,
  likes             INT         NOT NULL DEFAULT 0,
  comments          INT         NOT NULL DEFAULT 0,
  shares            INT         NOT NULL DEFAULT 0,
  clicks            INT         NOT NULL DEFAULT 0,
  saves             INT         NOT NULL DEFAULT 0,

  -- Derived (stored for fast querying)
  engagement_rate   NUMERIC(6,4) GENERATED ALWAYS AS (
    CASE WHEN NULLIF(reach, 0) IS NULL THEN 0
         ELSE ROUND(
           (likes + comments + shares + saves)::NUMERIC / NULLIF(reach, 0) * 100,
           4
         )
    END
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_post_metrics_org_measured
  ON kefy_post_metrics (org_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS kefy_post_metrics_post
  ON kefy_post_metrics (scheduled_post_id, measured_at DESC);
