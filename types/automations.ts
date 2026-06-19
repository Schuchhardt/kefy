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
  is_active:          boolean;
  next_run_at:        string | null;
  last_run_at:        string | null;
  created_at:         string;
}

// ─── Engagement rules ────────────────────────────────────────────────────────

export type TriggerType = 'new_comment' | 'new_review' | 'new_follower' | 'mention';
export type ActionType  = 'reply_comment' | 'reply_review' | 'send_dm' | 'like_comment';

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
  is_active:          boolean;
  created_at:         string;
}
