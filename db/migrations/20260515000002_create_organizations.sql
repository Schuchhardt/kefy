-- Migration: 004 — Organizations, memberships, subscriptions
-- Created: 2026-05-15

CREATE TABLE IF NOT EXISTS kefy_organizations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  slug                TEXT        UNIQUE NOT NULL,
  plan                TEXT        NOT NULL DEFAULT 'starter'
                                  CHECK (plan IN ('starter', 'pro', 'business')),
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_organizations_slug_idx ON kefy_organizations (slug);
CREATE INDEX IF NOT EXISTS kefy_organizations_stripe_customer_idx ON kefy_organizations (stripe_customer_id);

CREATE TRIGGER kefy_organizations_updated_at
  BEFORE UPDATE ON kefy_organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Membership ties a user to an org with a role
CREATE TABLE IF NOT EXISTS kefy_org_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS kefy_org_memberships_org_idx  ON kefy_org_memberships (org_id);
CREATE INDEX IF NOT EXISTS kefy_org_memberships_user_idx ON kefy_org_memberships (user_id);

-- One subscription per org (synced from Stripe)
CREATE TABLE IF NOT EXISTS kefy_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL UNIQUE REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT        UNIQUE,
  plan                    TEXT        NOT NULL DEFAULT 'starter'
                                      CHECK (plan IN ('starter', 'pro', 'business')),
  status                  TEXT        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_subscriptions_org_idx    ON kefy_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS kefy_subscriptions_stripe_idx ON kefy_subscriptions (stripe_subscription_id);

CREATE TRIGGER kefy_subscriptions_updated_at
  BEFORE UPDATE ON kefy_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
