// ─── Zernio platform ─────────────────────────────────────────────────────────

export type ZernioPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'reddit'
  | 'pinterest'
  | 'bluesky'
  | 'googlebusiness'
  | 'telegram'
  | 'snapchat'
  | 'discord'
  | 'whatsapp';

/** Subset of platforms that support inbox / DMs / comments in the dashboard. */
export type MessagingPlatform =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads';

// ─── SocialAccount (canonical superset) ──────────────────────────────────────

/** Unified social account shape — superset of all places that consume it.
 *  Fields beyond `id` / `platform` / `username` are optional because not every
 *  query selects them (`/api/social/accounts` vs lite calendar fetch, etc.). */
export interface SocialAccount {
  id:                 string;
  platform:           string;
  username:           string;
  avatar_url?:        string | null;
  status?:            string;
  zernio_account_id?: string;
  token_expires_at?:  string | null;
}

// ─── Zernio account & publishing ─────────────────────────────────────────────

export interface ZernioAccount {
  id:                string;
  platform:          ZernioPlatform;
  external_id:       string;
  username:          string;
  avatar_url:        string | null;
  access_token:      string;
  refresh_token:     string | null;
  token_expires_at:  string | null;
}

export interface ZernioPublishPayload {
  account_id:    string;
  text:          string;
  image_url?:    string;
  media_urls?:   string[];
  video_url?:    string;
  content_type?: 'post' | 'carousel' | 'reel';
  hashtags?:     string[];
  scheduled_at?: string;
}

export interface ZernioPublishResult {
  post_id:           string;
  platform_post_id:  string | null;
  status:            'published' | 'scheduled' | 'pending';
  published_at:      string | null;
  scheduled_at:      string | null;
}

export interface ZernioConnectResult {
  account:        ZernioAccount;
  access_token:   string;
  refresh_token:  string | null;
  expires_at:     string | null;
}

// ─── Zernio profiles ─────────────────────────────────────────────────────────

export interface ZernioProfile {
  _id:         string;
  name:        string;
  description: string | null;
  created_at:  string;
}

// ─── Zernio analytics ────────────────────────────────────────────────────────

export interface ZernioAccountMetrics {
  followers_count: number;
  following_count: number;
  posts_count:     number;
}

export interface ZernioPostAnalytics {
  impressions:    number;
  reach:          number;
  likes:          number;
  comments:       number;
  shares:         number;
  saves:          number;
  clicks:         number;
  views:          number;
  engagementRate: number;
}

export interface ZernioInstagramInsightsMetric {
  total:   number;
  values?: Array<{ date: string; value: number }>;
}

export interface ZernioInstagramInsights {
  success:    boolean;
  accountId:  string;
  platform:   string;
  dateRange:  { since: string; until: string };
  metricType: string;
  metrics:    Record<string, ZernioInstagramInsightsMetric>;
  dataDelay?: string;
}

// ─── Zernio messaging (legacy threads API) ───────────────────────────────────

export interface ZernioMessage {
  message_id:    string;
  thread_id:     string;
  sender_id:     string;
  sender_name:   string | null;
  sender_avatar: string | null;
  body:          string;
  direction:     'inbound' | 'outbound';
  read_at:       string | null;
  created_at:    string;
}

export interface ZernioThread {
  thread_id:          string;
  participant_id:     string;
  participant_name:   string | null;
  participant_avatar: string | null;
  last_message_body:  string;
  last_message_at:    string;
  unread_count:       number;
}

export interface ListMessagesParams {
  thread_id?: string;
  limit?:     number;
  before?:    string;
}

// ─── Zernio inbox conversations ──────────────────────────────────────────────

export interface ZernioInboxConversation {
  id:                       string;
  platform:                 string;
  accountId:                string;
  accountUsername:          string;
  participantId:            string;
  participantName:          string | null;
  participantPicture:       string | null;
  participantVerifiedType:  string | null;
  lastMessage:              string;
  updatedTime:              string;
  status:                   'active' | 'archived';
  unreadCount:              number;
  url:                      string | null;
  instagramProfile?: {
    isFollower:    boolean;
    isFollowing:   boolean;
    followerCount: number;
    isVerified:    boolean;
    fetchedAt:     string;
  } | null;
}

export interface ZernioInboxResponse {
  data:       ZernioInboxConversation[];
  pagination: { hasMore: boolean; nextCursor: string | null };
  meta: {
    accountsQueried: number;
    accountsFailed:  number;
    failedAccounts:  Array<{
      accountId:       string;
      accountUsername: string;
      platform:        string;
      error:           string;
      code:            string;
      retryAfter:      number | null;
    }>;
    lastUpdated: string;
  };
}

export interface ZernioInboxMessage {
  id:             string;
  conversationId: string;
  accountId:      string;
  platform:       string;
  message:        string;
  senderId:       string;
  senderName:     string | null;
  direction:      'incoming' | 'outgoing';
  createdAt:      string;
  attachments?: Array<{
    id:          string;
    type:        string;
    url:         string;
    filename?:   string;
    previewUrl?: string;
  }>;
}

export interface ZernioInboxMessagesResponse {
  status:            string;
  pagination:        { hasMore: boolean; nextCursor: string | null };
  sortOrderApplied:  'asc' | 'desc';
  messages:          ZernioInboxMessage[];
  lastUpdated:       string;
}

export interface ZernioSendMessageResponse {
  messageId:      string;
  conversationId: string;
}

// ─── Zernio comments & reviews ───────────────────────────────────────────────

export interface ZernioComment {
  comment_id:    string;
  post_id:       string;
  author_id:     string;
  author_name:   string | null;
  author_avatar: string | null;
  body:          string;
  created_at:    string;
}

export interface ZernioReview {
  review_id:       string;
  reviewer_id:     string;
  reviewer_name:   string | null;
  reviewer_avatar: string | null;
  rating:          number | null;
  body:            string | null;
  published_at:    string | null;
}

// ─── Zernio ads / boost ──────────────────────────────────────────────────────

export type ZernioBoostObjective = 'reach' | 'engagement' | 'traffic' | 'leads';

export interface ZernioBoostPayload {
  account_id:    string;
  post_id:       string;
  budget_cents:  number;
  currency:      string;
  duration_days: number;
  objective:     ZernioBoostObjective;
  targeting?:    Record<string, unknown>;
}

export interface ZernioBoostResult {
  boost_id:       string;
  platform_ad_id: string | null;
  status:         'pending' | 'active' | 'completed' | 'cancelled' | 'failed';
  started_at:     string | null;
  ended_at:       string | null;
}

// ─── Zernio webhook payload ──────────────────────────────────────────────────

/** Generic Zernio webhook envelope. Concrete event payloads vary per event type. */
export interface ZernioWebhookEvent {
  event:      string;
  account_id?: string;
  post_id?:   string;
  payload?:   Record<string, unknown>;
  [key: string]: unknown;
}
