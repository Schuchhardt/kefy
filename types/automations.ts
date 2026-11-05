import type { Channel } from '@/types/channels';
import type { AIModel } from '@/types/ai';
import type { AutopilotFormat, RuleCost, WeeklyFormats } from '@/lib/autopilot-formats';

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** Última ejecución de una regla (GET /api/autopilot/rules, list_autopilot_rules). */
export interface AutopilotLastRun {
  id:                 string;
  status:             'success' | 'failed';
  ran_at:             string;
  format:             AutopilotFormat | null;
  content_item_id:    string | null;
  scheduled_post_ids: string[];
  error_message:      string | null;
  credits_estimated:  number | null;
  video_status:       'producing' | 'published' | 'failed' | 'cancelled' | null;
  video_attempts:     number;
  story_status:       'scheduled' | 'published' | 'failed' | 'skipped' | null;
  story_error:        string | null;
}

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
  topic_hints?:       string[];
  /** null: automático (etiqueta del tema o red). */
  format?:            AutopilotFormat | null;
  /** Mezcla semanal (reglas diarias): día → formato o 'skip'. */
  weekly_formats?:    WeeklyFormats | null;
  also_story?:        boolean;
  story_delay_minutes?: number;
  status:             'active' | 'paused';
  /** La pausó el sistema: sin créditos (se reanuda sola el mes siguiente) o sin cuentas (al reconectarla). */
  paused_reason?:     'credits_exhausted' | 'no_accounts' | null;
  next_run_at:        string | null;
  last_run_at:        string | null;
  created_at:         string;
  last_run?:          AutopilotLastRun | null;
  cost?:              RuleCost;
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
  trigger_config?:    Record<string, unknown> | null;
  lead_action_type?:  'create_lead' | 'update_lead' | null;
  lead_action_score_delta?: number | null;
  times_triggered:    number;
  last_triggered_at:  string | null;
  created_at:         string;
}
