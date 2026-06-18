// Shared types for dashboard content components.

import type { Channel } from '@/lib/channels';

export type ContentStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'archived';
export type ContentType   = 'post' | 'carousel' | 'reel';

export interface ReelScene {
  scene_order:      number;
  title:            string;
  body:             string;
  image_url?:       string | null;
  duration_seconds: number;
}

export interface CarouselSlide {
  slide_order: number;
  title:       string;
  body:        string;
  image_url?:  string | null;
}

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
  /** Optional: indicates the cover image is still being generated (frontend-only). */
  image_pending?:   boolean;
}

export interface SocialAccount {
  id:                 string;
  platform:           string;
  username:           string;
  avatar_url:         string | null;
  zernio_account_id:  string;
  status:             string;
}

export interface BrandKitInfo {
  name:          string | null;
  logo_url:      string | null;
  primary_color: string | null;
  accent_color:  string | null;
  font_heading:  string | null;
}
