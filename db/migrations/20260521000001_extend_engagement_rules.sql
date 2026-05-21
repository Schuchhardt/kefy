-- Extend kefy_engagement_rules:
-- 1. Drop old CHECK constraints on trigger_type and action_type
-- 2. Add new trigger/action values
-- 3. Add new columns for AI, delays, lead scoring, and metrics

-- ── Drop old constraints ──────────────────────────────────────────────────────
ALTER TABLE kefy_engagement_rules
  DROP CONSTRAINT IF EXISTS kefy_engagement_rules_trigger_type_check,
  DROP CONSTRAINT IF EXISTS kefy_engagement_rules_action_type_check;

-- ── New CHECK constraints with all supported values ───────────────────────────
ALTER TABLE kefy_engagement_rules
  ADD CONSTRAINT kefy_engagement_rules_trigger_type_check
    CHECK (trigger_type IN (
      'new_comment',
      'new_review',
      'new_follower',
      'mention',
      'comment_contains_keyword',
      'new_dm',
      'dm_contains_keyword',
      'brand_mention',
      'dm_no_response',
      'lead_score_threshold',
      'post_shared'
    ));

ALTER TABLE kefy_engagement_rules
  ADD CONSTRAINT kefy_engagement_rules_action_type_check
    CHECK (action_type IN (
      'reply_comment',
      'reply_review',
      'send_dm',
      'like_comment',
      'send_dm_ai_response',
      'reply_comment_ai',
      'reply_review_ai',
      'notify_team',
      'add_to_list'
    ));

-- ── New columns ───────────────────────────────────────────────────────────────
ALTER TABLE kefy_engagement_rules
  ADD COLUMN IF NOT EXISTS trigger_config     JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS conditions         JSONB        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS action_config      JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_context         TEXT,
  ADD COLUMN IF NOT EXISTS delay_minutes      INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_from       TEXT         NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS times_triggered    INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_triggered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leads_generated    INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_action_type   TEXT         CHECK (lead_action_type IN ('create_lead', 'update_lead')),
  ADD COLUMN IF NOT EXISTS lead_action_score_delta INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_action_stage  TEXT;
