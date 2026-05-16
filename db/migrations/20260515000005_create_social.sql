-- Migration: 007 — Social accounts and scheduled posts
-- Created: 2026-05-15
--
-- kefy_social_accounts: social media accounts connected to an org via Zernio.
-- kefy_scheduled_posts: publication queue (immediate or scheduled).
--
-- NOTE: access_token is stored as-is here. In production, encrypt it at the
-- application layer before inserting (e.g. AES-256-GCM with ENCRYPTION_KEY).

CREATE TABLE IF NOT EXISTS kefy_social_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  platform        TEXT        NOT NULL
                              CHECK (platform IN ('linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads')),
  external_id     TEXT        NOT NULL,   -- platform user/page ID
  username        TEXT,                   -- display name / handle
  avatar_url      TEXT,
  access_token    TEXT        NOT NULL,   -- OAuth token (encrypt in production)
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  zernio_account_id TEXT,                -- Zernio's own account reference
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'expired', 'revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS kefy_social_accounts_org_idx      ON kefy_social_accounts (org_id);
CREATE INDEX IF NOT EXISTS kefy_social_accounts_platform_idx ON kefy_social_accounts (org_id, platform);

CREATE TRIGGER kefy_social_accounts_updated_at
  BEFORE UPDATE ON kefy_social_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- One row per content item × social account publication attempt
CREATE TABLE IF NOT EXISTS kefy_scheduled_posts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  content_item_id     UUID        NOT NULL REFERENCES kefy_content_items(id) ON DELETE CASCADE,
  social_account_id   UUID        NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,
  scheduled_at        TIMESTAMPTZ,          -- NULL = publish immediately
  published_at        TIMESTAMPTZ,
  zernio_post_id      TEXT,                 -- Zernio's post reference
  platform_post_id    TEXT,                 -- native platform post ID after publish
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'scheduled', 'published', 'failed', 'cancelled')),
  error_message       TEXT,
  created_by          UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_org_idx     ON kefy_scheduled_posts (org_id);
CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_item_idx    ON kefy_scheduled_posts (content_item_id);
CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_account_idx ON kefy_scheduled_posts (social_account_id);
CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_status_idx  ON kefy_scheduled_posts (org_id, status);
CREATE INDEX IF NOT EXISTS kefy_scheduled_posts_sched_idx   ON kefy_scheduled_posts (org_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status = 'scheduled';

CREATE TRIGGER kefy_scheduled_posts_updated_at
  BEFORE UPDATE ON kefy_scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
