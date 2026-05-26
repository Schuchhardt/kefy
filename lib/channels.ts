// ─── Channel types ────────────────────────────────────────────────────────────

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

// ─── Channel definitions ──────────────────────────────────────────────────────

export interface ChannelDef {
  value:  Channel;
  label:  string;
  group:  'organic' | 'ads' | 'other';
}

export const CHANNELS: ChannelDef[] = [
  // Organic
  { value: 'instagram',       label: 'Instagram',        group: 'organic' },
  { value: 'tiktok',          label: 'TikTok',           group: 'organic' },
  { value: 'linkedin',        label: 'LinkedIn',         group: 'organic' },
  { value: 'facebook',        label: 'Facebook',         group: 'organic' },
  { value: 'youtube',         label: 'YouTube',          group: 'organic' },
  { value: 'threads',         label: 'Threads',          group: 'organic' },
  { value: 'reddit',          label: 'Reddit',           group: 'organic' },
  { value: 'pinterest',       label: 'Pinterest',        group: 'organic' },
  { value: 'googlebusiness',  label: 'Google Business',  group: 'organic' },
  { value: 'discord',         label: 'Discord',          group: 'organic' },
  // Ads
  { value: 'meta_ads',        label: 'Meta Ads',         group: 'ads' },
  { value: 'google_ads',      label: 'Google Ads',       group: 'ads' },
  { value: 'linkedin_ads',    label: 'LinkedIn Ads',     group: 'ads' },
  { value: 'tiktok_ads',      label: 'TikTok Ads',       group: 'ads' },
  { value: 'pinterest_ads',   label: 'Pinterest Ads',    group: 'ads' },
  // Legacy / catch-all
  { value: 'twitter',         label: 'X / Twitter',      group: 'organic' },
  { value: 'generic',         label: 'Generic',          group: 'other' },
];

export const ORGANIC_CHANNELS = CHANNELS.filter((c) => c.group === 'organic');
export const AD_CHANNELS       = CHANNELS.filter((c) => c.group === 'ads');

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const CHANNEL_LABELS: Record<Channel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.value, c.label]),
) as Record<Channel, string>;

export const CHANNEL_VALUES: Channel[] = CHANNELS.map((c) => c.value);

/** Returns the label for a channel value.
 *  Accepts an optional override for 'generic' (used for i18n). */
export function getChannelLabel(value: Channel, genericLabel?: string): string {
  if (value === 'generic' && genericLabel) return genericLabel;
  return CHANNEL_LABELS[value] ?? value;
}

/** Validates that a string is a known Channel value. */
export function isChannel(value: string): value is Channel {
  return CHANNEL_VALUES.includes(value as Channel);
}
