-- Remove unsupported trigger and action types from engagement rules constraints.
-- Removed triggers: dm_no_response, new_review
-- Removed actions: like_comment, notify_team, add_to_list, reply_review, reply_review_ai

ALTER TABLE kefy_engagement_rules
  DROP CONSTRAINT IF EXISTS kefy_engagement_rules_trigger_type_check,
  DROP CONSTRAINT IF EXISTS kefy_engagement_rules_action_type_check;

ALTER TABLE kefy_engagement_rules
  ADD CONSTRAINT kefy_engagement_rules_trigger_type_check
    CHECK (trigger_type IN (
      'new_comment',
      'new_follower',
      'mention',
      'comment_contains_keyword',
      'new_dm',
      'dm_contains_keyword',
      'brand_mention',
      'post_shared',
      'lead_score_threshold'
    ));

ALTER TABLE kefy_engagement_rules
  ADD CONSTRAINT kefy_engagement_rules_action_type_check
    CHECK (action_type IN (
      'reply_comment',
      'send_dm',
      'reply_comment_ai',
      'send_dm_ai_response'
    ));

-- Drop reviews table (Google Business integration removed)
DROP TABLE IF EXISTS kefy_reviews;

-- Remove review-related automation packs
DELETE FROM kefy_automation_packs
  WHERE trigger_type IN ('new_review')
     OR action_type  IN ('reply_review', 'reply_review_ai');

-- Update lead scoring config defaults (remove 'review' key)
UPDATE kefy_lead_scoring_config
  SET defaults = defaults - 'review'
  WHERE defaults ? 'review';

-- Update lead interaction type constraint (remove 'review')
ALTER TABLE kefy_lead_interactions
  DROP CONSTRAINT IF EXISTS kefy_lead_interactions_type_check;

ALTER TABLE kefy_lead_interactions
  ADD CONSTRAINT kefy_lead_interactions_type_check
    CHECK (type IN ('comment','dm','mention','follow','share','click','manual'));
