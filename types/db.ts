// Row types derived from db/migrations/*.sql — keep in sync with migrations.
// Naming: `<Table>Row` mirrors the raw row shape returned by Supabase queries
// (snake_case, ISO date strings for timestamptz).

import type { BillingPlan } from '@/types/billing';
import type { BrandTone, CompanySize, SocialUrls } from '@/types/brand-kit';
import type { ContentStatus, ContentType, CarouselSlide, ReelScene, PostStatus } from '@/types/content';
import type { ContentChannel } from '@/types/ai';
import type { ZernioBoostObjective } from '@/types/social';

// ─── Common ──────────────────────────────────────────────────────────────────

type ISODate = string;

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface UserRow {
  id:            string;
  email:         string;
  password_hash: string;
  name:          string | null;
  created_at:    ISODate;
  updated_at:    ISODate;
}

export interface RefreshTokenRow {
  id:         string;
  user_id:    string;
  token_hash: string;
  expires_at: ISODate;
  created_at: ISODate;
}

export interface PasswordResetTokenRow {
  id:         string;
  user_id:    string;
  token_hash: string;
  expires_at: ISODate;
  created_at: ISODate;
}

// ─── Organizations & memberships ─────────────────────────────────────────────

export type MembershipRole = 'owner' | 'admin' | 'member';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface OrganizationRow {
  id:                 string;
  name:               string;
  slug:               string;
  plan:               BillingPlan;
  stripe_customer_id: string | null;
  zernio_profile_id:  string | null;
  created_at:         ISODate;
  updated_at:         ISODate;
}

export interface OrgMembershipRow {
  id:         string;
  org_id:     string;
  user_id:    string;
  role:       MembershipRole;
  created_at: ISODate;
}

export interface SubscriptionRow {
  id:                     string;
  org_id:                 string;
  stripe_subscription_id: string | null;
  plan:                   BillingPlan;
  status:                 SubscriptionStatus;
  current_period_start:   ISODate | null;
  current_period_end:     ISODate | null;
  created_at:             ISODate;
  updated_at:             ISODate;
}

// ─── Brands & brand kits ─────────────────────────────────────────────────────

export interface BrandRow {
  id:         string;
  org_id:     string;
  name:       string;
  slug:       string;
  avatar_url: string | null;
  archived:   boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface BrandKitRow {
  id:                  string;
  org_id:              string;
  brand_id:            string;
  name:                string;
  tagline:             string | null;
  industry:            string | null;
  tone:                BrandTone[];
  primary_color:       string | null;
  secondary_color:     string | null;
  accent_color:        string | null;
  font_heading:        string | null;
  font_body:           string | null;
  notes:               string | null;
  website_url:         string | null;
  social_urls:         SocialUrls;
  language:            string;
  customer_locations:  string[];
  uses_emojis:         boolean;
  communication_style: string | null;
  mission:             string | null;
  company_size:        CompanySize | null;
  differentiators:     string[];
  challenges:          string[];
  niche:               string | null;
  competitors:         string[];
  target_audience:     string | null;
  logo_url:            string | null;
  created_at:          ISODate;
  updated_at:          ISODate;
}

export type BrandAssetType = 'logo' | 'image' | 'icon' | 'other';

export interface BrandAssetRow {
  id:           string;
  brand_kit_id: string;
  org_id:       string;
  type:         BrandAssetType;
  label:        string | null;
  storage_path: string;
  public_url:   string;
  file_size:    number | null;
  mime_type:    string | null;
  created_at:   ISODate;
}

// ─── Content ─────────────────────────────────────────────────────────────────

export type ContentRenderStatus = 'not_rendered' | 'rendering' | 'ready' | 'error';

export interface ContentItemRow {
  id:               string;
  org_id:           string;
  brand_kit_id:     string | null;
  brand_id:         string | null;
  channel:          ContentChannel;
  status:           ContentStatus;
  title:            string | null;
  body:             string | null;
  image_url:        string | null;
  image_prompt:     string | null;
  hashtags:         string[];
  metadata:         Record<string, unknown>;
  created_by:       string | null;
  content_type:     ContentType;
  slides:           CarouselSlide[] | ReelScene[] | null;
  video_url:        string | null;
  mux_asset_id:     string | null;
  mux_playback_id:  string | null;
  render_status:    ContentRenderStatus;
  created_at:       ISODate;
  updated_at:       ISODate;
}

export interface ContentDraftRow {
  id:              string;
  content_item_id: string;
  org_id:          string;
  brand_id:        string | null;
  body:            string;
  model:           string;
  prompt_used:     string | null;
  tokens_used:     number | null;
  selected:        boolean;
  created_at:      ISODate;
}

// ─── Strategy catalog ────────────────────────────────────────────────────────

export interface ContentObjectiveRow {
  id:         string;
  slug:       string;
  name_es:    string;
  name_en:    string;
  desc_es:    string | null;
  desc_en:    string | null;
  icon:       string | null;
  sort_order: number;
  created_at: ISODate;
}

export interface ContentIndustryRow {
  id:         string;
  slug:       string;
  name_es:    string;
  name_en:    string;
  icon:       string | null;
  desc_es:    string | null;
  sort_order: number;
  created_at: ISODate;
}

export interface ContentStrategyInteractionLayer {
  num_es:   string;
  num_en:   string;
  title_es: string;
  title_en: string;
  items_es: string[];
  items_en: string[];
}

export interface ContentStrategyRow {
  id:                  string;
  objective_id:        string;
  industry_id:         string;
  framework_slug:      string;
  framework_name_es:   string;
  framework_name_en:   string;
  framework_desc_es:   string | null;
  framework_desc_en:   string | null;
  kpi_primary_es:      string | null;
  kpi_secondary_es:    string | null;
  kpi_primary_en:      string | null;
  kpi_secondary_en:    string | null;
  interaction_layers:  ContentStrategyInteractionLayer[];
  cta_mechanic_es:     string | null;
  cta_mechanic_en:     string | null;
  created_at:          ISODate;
}

export interface StrategyTemplateRow {
  id:                string;
  strategy_id:       string;
  week_num:          number;
  post_num:          number;
  format:            string;
  channel_hint:      string;
  topic_es:          string;
  copy_structure_es: string | null;
  goal_es:           string | null;
  topic_en:          string | null;
  copy_structure_en: string | null;
  goal_en:           string | null;
  sort_order:        number;
  created_at:        ISODate;
}

export interface OrgStrategyRow {
  id:           string;
  org_id:       string;
  objective_id: string | null;
  industry_id:  string | null;
  strategy_id:  string | null;
  custom_notes: string | null;
  created_at:   ISODate;
  updated_at:   ISODate;
}

// ─── Social ──────────────────────────────────────────────────────────────────

export type SocialAccountStatus = 'active' | 'expired' | 'revoked';
export type SocialPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads';

export interface SocialAccountRow {
  id:                string;
  org_id:            string;
  brand_id:          string | null;
  platform:          SocialPlatform;
  external_id:       string;
  username:          string | null;
  avatar_url:        string | null;
  access_token:      string;
  refresh_token:     string | null;
  token_expires_at:  ISODate | null;
  zernio_account_id: string | null;
  status:            SocialAccountStatus;
  created_at:        ISODate;
  updated_at:        ISODate;
}

export interface ScheduledPostRow {
  id:                string;
  org_id:            string;
  content_item_id:   string;
  social_account_id: string;
  scheduled_at:      ISODate | null;
  published_at:      ISODate | null;
  zernio_post_id:    string | null;
  platform_post_id:  string | null;
  status:            PostStatus;
  error_message:     string | null;
  created_by:        string | null;
  created_at:        ISODate;
  updated_at:        ISODate;
}

export interface PostMetricsRow {
  id:                string;
  org_id:            string;
  scheduled_post_id: string;
  measured_at:       ISODate;
  impressions:       number;
  reach:             number;
  likes:             number;
  comments:          number;
  shares:            number;
  clicks:            number;
  saves:             number;
  engagement_rate:   number;
  created_at:        ISODate;
}

export interface FollowerSnapshotRow {
  id:                string;
  org_id:            string;
  social_account_id: string;
  followers_count:   number;
  following_count:   number;
  posts_count:       number;
  measured_at:       ISODate;
  created_at:        ISODate;
}

// ─── Messaging, comments, reviews ────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound';

export interface MessageRow {
  id:                  string;
  org_id:              string;
  social_account_id:   string;
  platform:            SocialPlatform;
  platform_thread_id:  string;
  platform_message_id: string;
  zernio_message_id:   string | null;
  sender_id:           string;
  sender_name:         string | null;
  sender_avatar:       string | null;
  body:                string;
  direction:           MessageDirection;
  read_at:             ISODate | null;
  replied_at:          ISODate | null;
  created_at:          ISODate;
}

export interface CommentRow {
  id:                  string;
  org_id:              string;
  social_account_id:   string;
  scheduled_post_id:   string | null;
  platform:            SocialPlatform;
  platform_post_id:    string;
  platform_comment_id: string;
  zernio_comment_id:   string | null;
  author_id:           string;
  author_name:         string | null;
  author_avatar:       string | null;
  body:                string;
  replied_at:          ISODate | null;
  reply_body:          string | null;
  created_at:          ISODate;
}

// ─── Ads / boosts ────────────────────────────────────────────────────────────

export type BoostStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed';

export interface AdBoostRow {
  id:                string;
  org_id:            string;
  scheduled_post_id: string;
  social_account_id: string;
  budget_cents:      number;
  currency:          string;
  duration_days:     number;
  objective:         ZernioBoostObjective;
  targeting_json:    Record<string, unknown>;
  zernio_boost_id:   string | null;
  platform_ad_id:    string | null;
  status:            BoostStatus;
  started_at:        ISODate | null;
  ended_at:          ISODate | null;
  created_by:        string | null;
  created_at:        ISODate;
  updated_at:        ISODate;
}

// ─── Autopilot ───────────────────────────────────────────────────────────────

export type AutopilotFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type AutopilotStatus = 'active' | 'paused';
export type AutopilotAiModel = 'claude' | 'gpt';

export interface AutopilotRuleRow {
  id:                 string;
  org_id:             string;
  created_by:         string;
  name:               string;
  channel:            ContentChannel;
  social_account_ids: string[];
  frequency:          AutopilotFrequency;
  day_of_week:        number | null;
  time_of_day:        string;
  timezone:           string;
  ai_model:           AutopilotAiModel;
  tone:               string | null;
  topic_hints:        string[];
  status:             AutopilotStatus;
  last_run_at:        ISODate | null;
  next_run_at:        ISODate | null;
  created_at:         ISODate;
  updated_at:         ISODate;
}

export interface AutopilotRunRow {
  id:                  string;
  rule_id:             string;
  org_id:              string;
  content_item_id:     string | null;
  scheduled_post_ids:  string[];
  status:              'success' | 'failed';
  error_message:       string | null;
  ran_at:              ISODate;
}

export interface AutomationPackRow {
  id:           string;
  objective_id: string;
  name_es:      string;
  name_en:      string;
  desc_es:      string | null;
  desc_en:      string | null;
  icon:         string | null;
  sort_order:   number;
  created_at:   ISODate;
}

export interface AutomationPackRuleRow {
  id:                       string;
  pack_id:                  string;
  name_es:                  string;
  name_en:                  string;
  desc_es:                  string | null;
  desc_en:                  string | null;
  trigger_type:             string;
  trigger_config:           Record<string, unknown>;
  action_type:              string;
  action_config:            Record<string, unknown>;
  ai_context:               string | null;
  delay_minutes:            number;
  lead_action_type:         'create_lead' | 'update_lead' | null;
  lead_action_score_delta:  number | null;
  lead_action_stage:        string | null;
  sort_order:               number;
  created_at:               ISODate;
}

// ─── Engagement rules ────────────────────────────────────────────────────────

export interface EngagementRuleRow {
  id:                       string;
  org_id:                   string;
  name:                     string;
  trigger_type:             string;
  condition_platform:       string | null;
  condition_keyword:        string | null;
  condition_rating:         number | null;
  action_type:              string;
  action_template:          string;
  is_active:                boolean;
  trigger_config:           Record<string, unknown>;
  conditions:               unknown[];
  action_config:            Record<string, unknown>;
  ai_context:               string | null;
  delay_minutes:            number;
  created_from:             string;
  times_triggered:          number;
  last_triggered_at:        ISODate | null;
  leads_generated:          number;
  lead_action_type:         'create_lead' | 'update_lead' | null;
  lead_action_score_delta:  number | null;
  lead_action_stage:        string | null;
  created_at:               ISODate;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export type LeadStageDb = 'frio' | 'tibio' | 'caliente' | 'contactado' | 'convertido';

export interface LeadRow {
  id:                   string;
  org_id:               string;
  username:             string;
  display_name:         string | null;
  avatar_url:           string | null;
  channel:              string;
  stage:                LeadStageDb;
  score:                number;
  notes:                string | null;
  tags:                 string[];
  contacted:            boolean;
  contacted_at:         ISODate | null;
  converted:            boolean;
  converted_at:         ISODate | null;
  first_interaction_at: ISODate;
  last_interaction_at:  ISODate;
  created_at:           ISODate;
}

export type LeadInteractionType =
  | 'comment'
  | 'dm'
  | 'mention'
  | 'follow'
  | 'share'
  | 'click'
  | 'manual';

export interface LeadInteractionRow {
  id:              string;
  lead_id:         string;
  org_id:          string;
  type:            LeadInteractionType;
  content_preview: string | null;
  post_id:         string | null;
  score_delta:     number;
  rule_id:         string | null;
  timestamp:       ISODate;
}

export interface LeadScoringConfigRow {
  id:         string;
  org_id:     string;
  defaults:   Record<LeadInteractionType, number>;
  thresholds: Partial<Record<LeadStageDb, number>>;
  created_at: ISODate;
  updated_at: ISODate;
}

// ─── Blog & waitlist ─────────────────────────────────────────────────────────

export interface BlogPostRow {
  id:           string;
  slug:         string;
  lang:         'es' | 'en';
  title:        string;
  excerpt:      string | null;
  content:      string;
  author:       string | null;
  cover_url:    string | null;
  published_at: ISODate;
}

export interface WaitlistRow {
  id:         string;
  email:      string;
  name:       string | null;
  interest:   string | null;
  created_at: ISODate;
}
