export type Channel =
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'reddit'
  | 'pinterest'
  | 'googlebusiness'
  | 'discord'
  | 'meta_ads'
  | 'google_ads'
  | 'linkedin_ads'
  | 'tiktok_ads'
  | 'pinterest_ads'
  | 'twitter'   // legacy alias for X/Twitter — kept for backward compat with existing DB records
  | 'generic';

export interface ChannelDef {
  value: Channel;
  label: string;
  group: 'organic' | 'ads' | 'other';
}
