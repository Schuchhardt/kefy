import type { Channel } from '@/types/channels';
import type { AIModel } from '@/types/ai';

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface AutopilotRule {
  id:                 string;
  name:               string;
  channel:            Channel;
  social_account_ids: string[];
  frequency:          Frequency;
  day_of_week:        number | null;
  time_of_day:        string;
  timezone:           string;
  ai_model:           AIModel;
  prompt_hint:        string | null;
  status:             'active' | 'paused';
  next_run_at:        string | null;
  last_run_at:        string | null;
  created_at:         string;
}

// ─── Engagement rules ────────────────────────────────────────────────────────

export type TriggerType =
  | 'new_comment'
  | 'new_follower'
  | 'mention'
  | 'comment_contains_keyword'
  | 'new_dm'
  | 'dm_contains_keyword'
  | 'brand_mention'
  | 'post_shared'
  | 'lead_score_threshold';

export type ActionType =
  | 'reply_comment'
  | 'send_dm'
  | 'reply_comment_ai'
  | 'send_dm_ai_response';

/** Platforms supported by engagement rules (subset of ZernioPlatform + 'all'). */
export type EngagementPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads'
  | 'all';

export interface EngagementRule {
  id:                 string;
  name:               string;
  trigger_type:       TriggerType;
  condition_platform: string | null;
  condition_keyword:  string | null;
  condition_rating:   number | null;
  action_type:        ActionType;
  action_template:    string;
  ai_context:         string | null;
  delay_minutes:      number;
  is_active:          boolean;
  times_triggered:    number;
  last_triggered_at:  string | null;
  created_at:         string;
}
