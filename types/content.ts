import type { Channel } from '@/types/channels';

// ─── Status & type ───────────────────────────────────────────────────────────

export type ContentStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';
export type ContentType   = 'post' | 'carousel' | 'reel';

// ─── Slides & scenes (canonical, supersets) ──────────────────────────────────

/** Canonical carousel slide. `image_prompt` is set by AI generation;
 *  `image_url` is set after the image has been rendered/uploaded. */
export interface CarouselSlide {
  slide_order:  number;
  title:        string;
  body:         string;
  image_prompt?: string;
  image_url?:   string | null;
}

/** Canonical reel scene (text overlay + duration + optional generated image). */
export interface ReelScene {
  scene_order:      number;
  title:            string;
  body:             string;
  duration_seconds: number;
  image_prompt?:    string;
  image_url?:       string | null;
}

// ─── Content item (canonical superset) ───────────────────────────────────────

export interface ContentItem {
  id:               string;
  channel:          Channel;
  content_type:     ContentType;
  status:           ContentStatus;
  title:            string | null;
  body:             string | null;
  image_url:        string | null;
  hashtags:         string[];
  slides:           ReelScene[] | CarouselSlide[] | null;
  video_url:        string | null;
  mux_playback_id?: string | null;
  mux_asset_id?:    string | null;
  render_status?:   'not_rendered' | 'rendering' | 'ready' | 'error' | null;
  created_at:       string;
  /** Frontend-only: indicates the cover image is still being generated. */
  image_pending?:   boolean;
}

/** Slimmer shape used by the dashboard home "recent content" list. */
export interface RecentContentItem {
  id:           string;
  platform:     string;
  body:         string;
  status:       'published' | 'scheduled' | 'draft';
  published_at: string | null;
  created_at:   string;
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export type PostStatus = 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';

export interface ScheduledPostContent {
  id:      string;
  channel: string;
  title:   string | null;
  body:    string | null;
}

export interface ScheduledPost {
  id:                     string;
  status:                 PostStatus;
  scheduled_at:           string | null;
  published_at:           string | null;
  error_message:          string | null;
  created_at:             string;
  kefy_content_items:     ScheduledPostContent | null;
  kefy_social_accounts:   { id: string; platform: string; username: string; avatar_url: string | null; status: string } | null;
}

// ─── Dashboard summary ───────────────────────────────────────────────────────

export interface Totals {
  impressions: number;
  reach:       number;
  likes:       number;
  comments:    number;
  shares:      number;
  clicks:      number;
}

export interface OnboardingStep {
  key:   string;
  icon:  string;
  title: string;
  desc:  string;
}

// ─── API input ────────────────────────────────────────────────────────────────

/** Loose input shape for slides/scenes received from API requests. */
export interface SlideInput {
  slide_order:        number;
  title?:             string | null;
  body?:              string | null;
  image_url?:         string | null;
  duration_seconds?:  number | null;
}

// ─── BrandKit summary (used by content previews) ─────────────────────────────

export interface BrandKitInfo {
  name:          string | null;
  logo_url:      string | null;
  primary_color: string | null;
  accent_color:  string | null;
  font_heading:  string | null;
}
