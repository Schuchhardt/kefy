-- Migration: 010 — Messaging (DMs) + Comments tables
-- Created: 2026-05-15
--
-- kefy_messages: inbound and outbound DMs per social account.
-- kefy_comments:  comments received on published posts.

-- ─── Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_messages (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  social_account_id     UUID        NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,

  -- Platform identifiers
  platform              TEXT        NOT NULL
                                    CHECK (platform IN ('linkedin','instagram','facebook','twitter','tiktok','threads')),
  platform_thread_id    TEXT        NOT NULL,   -- conversation thread ID on the platform
  platform_message_id   TEXT        NOT NULL,   -- individual message ID
  zernio_message_id     TEXT,                   -- Zernio's own message ID

  -- Sender
  sender_id             TEXT        NOT NULL,   -- platform user ID
  sender_name           TEXT,
  sender_avatar         TEXT,

  -- Content
  body                  TEXT        NOT NULL CHECK (char_length(body) > 0),
  direction             TEXT        NOT NULL CHECK (direction IN ('inbound','outbound')),

  -- State
  read_at               TIMESTAMPTZ,
  replied_at            TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (social_account_id, platform_message_id)
);

CREATE INDEX IF NOT EXISTS kefy_messages_org_created
  ON kefy_messages (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_messages_thread
  ON kefy_messages (social_account_id, platform_thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS kefy_messages_unread
  ON kefy_messages (org_id, read_at)
  WHERE read_at IS NULL AND direction = 'inbound';

-- ─── Comments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_comments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  social_account_id     UUID        NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,
  scheduled_post_id     UUID        REFERENCES kefy_scheduled_posts(id) ON DELETE SET NULL,

  platform              TEXT        NOT NULL
                                    CHECK (platform IN ('linkedin','instagram','facebook','twitter','tiktok','threads')),
  platform_post_id      TEXT        NOT NULL,
  platform_comment_id   TEXT        NOT NULL,
  zernio_comment_id     TEXT,

  author_id             TEXT        NOT NULL,
  author_name           TEXT,
  author_avatar         TEXT,

  body                  TEXT        NOT NULL CHECK (char_length(body) > 0),

  replied_at            TIMESTAMPTZ,
  reply_body            TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (social_account_id, platform_comment_id)
);

CREATE INDEX IF NOT EXISTS kefy_comments_org_created
  ON kefy_comments (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_comments_post
  ON kefy_comments (scheduled_post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_comments_unreplied
  ON kefy_comments (org_id, replied_at)
  WHERE replied_at IS NULL;

-- ─── Reviews ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_reviews (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  social_account_id     UUID        NOT NULL REFERENCES kefy_social_accounts(id) ON DELETE CASCADE,

  platform              TEXT        NOT NULL
                                    CHECK (platform IN ('linkedin','instagram','facebook','twitter','tiktok','threads')),
  platform_review_id    TEXT        NOT NULL,
  zernio_review_id      TEXT,

  reviewer_id           TEXT        NOT NULL,
  reviewer_name         TEXT,
  reviewer_avatar       TEXT,

  rating                SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  body                  TEXT,

  replied_at            TIMESTAMPTZ,
  reply_body            TEXT,

  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (social_account_id, platform_review_id)
);

CREATE INDEX IF NOT EXISTS kefy_reviews_org_created
  ON kefy_reviews (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_reviews_unreplied
  ON kefy_reviews (org_id, replied_at)
  WHERE replied_at IS NULL;
