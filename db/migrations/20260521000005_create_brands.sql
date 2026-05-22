-- Migration: multi-brand support
-- Each org can manage multiple brands; all brand-scoped resources now reference brand_id.
-- Existing data is backfilled: 1 brand per org using org.name / org.slug.
-- Created: 2026-05-21

-- ─── 1. kefy_brands ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_brands (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  slug        TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  avatar_url  TEXT,
  archived    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_brands_org_idx      ON kefy_brands (org_id);
CREATE INDEX IF NOT EXISTS kefy_brands_org_active   ON kefy_brands (org_id) WHERE archived = false;

CREATE TRIGGER kefy_brands_updated_at
  BEFORE UPDATE ON kefy_brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill: one brand per existing org, reuse the org's slug
INSERT INTO kefy_brands (org_id, name, slug)
SELECT id, name, slug
FROM kefy_organizations
ON CONFLICT DO NOTHING;

-- ─── 2. kefy_brand_kits ───────────────────────────────────────────────────────
-- Was 1:1 with org. Now 1:1 with brand (UNIQUE brand_id).
-- Keep org_id FK for RLS/legacy queries.

ALTER TABLE kefy_brand_kits
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_brand_kits bk
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = bk.org_id
  AND bk.brand_id IS NULL;

ALTER TABLE kefy_brand_kits
  ALTER COLUMN brand_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kefy_brand_kits_brand_id_key'
  ) THEN
    ALTER TABLE kefy_brand_kits ADD CONSTRAINT kefy_brand_kits_brand_id_key UNIQUE (brand_id);
  END IF;
END $$;

-- Drop the old 1:1-with-org uniqueness (many brands can now share same org)
ALTER TABLE kefy_brand_kits DROP CONSTRAINT IF EXISTS kefy_brand_kits_org_id_key;

CREATE INDEX IF NOT EXISTS kefy_brand_kits_brand_idx ON kefy_brand_kits (brand_id);

-- ─── 3. kefy_content_items ───────────────────────────────────────────────────

ALTER TABLE kefy_content_items
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_content_items ci
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = ci.org_id
  AND ci.brand_id IS NULL;

CREATE INDEX IF NOT EXISTS kefy_content_items_brand_idx ON kefy_content_items (brand_id);

-- ─── 4. kefy_content_drafts ──────────────────────────────────────────────────

ALTER TABLE kefy_content_drafts
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_content_drafts cd
SET brand_id = ci.brand_id
FROM kefy_content_items ci
WHERE ci.id = cd.content_item_id
  AND cd.brand_id IS NULL
  AND ci.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_content_drafts_brand_idx ON kefy_content_drafts (brand_id);

-- ─── 5. kefy_social_accounts ─────────────────────────────────────────────────

ALTER TABLE kefy_social_accounts
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_social_accounts sa
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = sa.org_id
  AND sa.brand_id IS NULL;

-- Replace old unique constraint to be brand-scoped
ALTER TABLE kefy_social_accounts DROP CONSTRAINT IF EXISTS kefy_social_accounts_org_id_platform_external_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kefy_social_accounts_brand_platform_ext_key'
  ) THEN
    ALTER TABLE kefy_social_accounts
      ADD CONSTRAINT kefy_social_accounts_brand_platform_ext_key
      UNIQUE (brand_id, platform, external_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kefy_social_accounts_brand_idx ON kefy_social_accounts (brand_id);

-- ─── 6. kefy_scheduled_posts ─────────────────────────────────────────────────

ALTER TABLE kefy_scheduled_posts
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_scheduled_posts sp
SET brand_id = ci.brand_id
FROM kefy_content_items ci
WHERE ci.id = sp.content_item_id
  AND sp.brand_id IS NULL
  AND ci.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_brand_idx ON kefy_scheduled_posts (brand_id);

-- ─── 7. kefy_post_metrics ────────────────────────────────────────────────────

ALTER TABLE kefy_post_metrics
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_post_metrics pm
SET brand_id = sp.brand_id
FROM kefy_scheduled_posts sp
WHERE sp.id = pm.scheduled_post_id
  AND pm.brand_id IS NULL
  AND sp.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_post_metrics_brand_idx ON kefy_post_metrics (brand_id);

-- ─── 8. kefy_autopilot_rules ─────────────────────────────────────────────────

ALTER TABLE kefy_autopilot_rules
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_autopilot_rules ar
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = ar.org_id
  AND ar.brand_id IS NULL;

CREATE INDEX IF NOT EXISTS kefy_autopilot_rules_brand_idx ON kefy_autopilot_rules (brand_id);

-- ─── 9. kefy_autopilot_runs ──────────────────────────────────────────────────

ALTER TABLE kefy_autopilot_runs
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_autopilot_runs ar
SET brand_id = ru.brand_id
FROM kefy_autopilot_rules ru
WHERE ru.id = ar.rule_id
  AND ar.brand_id IS NULL
  AND ru.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_autopilot_runs_brand_idx ON kefy_autopilot_runs (brand_id);

-- ─── 10. kefy_engagement_rules ───────────────────────────────────────────────

ALTER TABLE kefy_engagement_rules
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_engagement_rules er
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = er.org_id
  AND er.brand_id IS NULL;

CREATE INDEX IF NOT EXISTS kefy_engagement_rules_brand_idx ON kefy_engagement_rules (brand_id);

-- ─── 11. kefy_messages ───────────────────────────────────────────────────────

ALTER TABLE kefy_messages
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_messages m
SET brand_id = sa.brand_id
FROM kefy_social_accounts sa
WHERE sa.id = m.social_account_id
  AND m.brand_id IS NULL
  AND sa.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_messages_brand_idx ON kefy_messages (brand_id);

-- ─── 12. kefy_comments ───────────────────────────────────────────────────────

ALTER TABLE kefy_comments
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_comments c
SET brand_id = sa.brand_id
FROM kefy_social_accounts sa
WHERE sa.id = c.social_account_id
  AND c.brand_id IS NULL
  AND sa.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_comments_brand_idx ON kefy_comments (brand_id);

-- ─── 13. kefy_follower_snapshots ─────────────────────────────────────────────

ALTER TABLE kefy_follower_snapshots
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_follower_snapshots fs
SET brand_id = sa.brand_id
FROM kefy_social_accounts sa
WHERE sa.id = fs.social_account_id
  AND fs.brand_id IS NULL
  AND sa.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_follower_snapshots_brand_idx ON kefy_follower_snapshots (brand_id);

-- ─── 14. kefy_ad_boosts ──────────────────────────────────────────────────────

ALTER TABLE kefy_ad_boosts
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_ad_boosts ab
SET brand_id = sp.brand_id
FROM kefy_scheduled_posts sp
WHERE sp.id = ab.scheduled_post_id
  AND ab.brand_id IS NULL
  AND sp.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_ad_boosts_brand_idx ON kefy_ad_boosts (brand_id);

-- ─── 15. kefy_leads ──────────────────────────────────────────────────────────

ALTER TABLE kefy_leads
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_leads l
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = l.org_id
  AND l.brand_id IS NULL;

-- Replace org-scoped unique with brand-scoped
ALTER TABLE kefy_leads DROP CONSTRAINT IF EXISTS kefy_leads_org_id_channel_username_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kefy_leads_brand_channel_username_key'
  ) THEN
    ALTER TABLE kefy_leads
      ADD CONSTRAINT kefy_leads_brand_channel_username_key
      UNIQUE (brand_id, channel, username);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kefy_leads_brand_idx ON kefy_leads (brand_id);

-- ─── 16. kefy_lead_interactions ──────────────────────────────────────────────

ALTER TABLE kefy_lead_interactions
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_lead_interactions li
SET brand_id = l.brand_id
FROM kefy_leads l
WHERE l.id = li.lead_id
  AND li.brand_id IS NULL
  AND l.brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_lead_interactions_brand_idx ON kefy_lead_interactions (brand_id);

-- ─── 17. kefy_lead_scoring_config ────────────────────────────────────────────

ALTER TABLE kefy_lead_scoring_config
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

UPDATE kefy_lead_scoring_config lsc
SET brand_id = b.id
FROM kefy_brands b
WHERE b.org_id = lsc.org_id
  AND lsc.brand_id IS NULL;

ALTER TABLE kefy_lead_scoring_config DROP CONSTRAINT IF EXISTS kefy_lead_scoring_config_org_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kefy_lead_scoring_config_brand_id_key'
  ) THEN
    ALTER TABLE kefy_lead_scoring_config
      ADD CONSTRAINT kefy_lead_scoring_config_brand_id_key UNIQUE (brand_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS kefy_lead_scoring_config_brand_idx ON kefy_lead_scoring_config (brand_id);
