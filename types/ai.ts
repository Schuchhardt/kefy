import type { CarouselSlide, ReelScene } from '@/types/content';

export type { CarouselSlide, ReelScene } from '@/types/content';

// ─── Channel & model ─────────────────────────────────────────────────────────

export type ContentChannel =
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'tiktok'
  | 'threads'
  | 'generic';

export type AIModel = 'claude' | 'gpt';

// ─── Text generation ─────────────────────────────────────────────────────────

export interface GenerateTextOptions {
  channel:    ContentChannel;
  topic:      string;
  tone?:      string[];
  language?:  'es' | 'en';
  model?:     AIModel;
  brandName?: string;
  tagline?:   string;
  extraCtx?:  string;
}

export interface GenerateTextResult {
  body:       string;
  hashtags:   string[];
  model:      string;
  tokensUsed: number;
}

// ─── Image generation ────────────────────────────────────────────────────────

export interface BrandImageContext {
  name?:           string;
  primaryColor?:   string;
  secondaryColor?: string;
  accentColor?:    string;
  tone?:           string[];
  logoB64?:        string;
  logoMimeType?:   string;
}

export interface GenerateImageOptions {
  prompt:           string;
  size?:            '1024x1024' | '1536x1024' | '1024x1536' | '1080x1080' | '1024x1792' | 'auto';
  quality?:         'low' | 'medium' | 'high' | 'auto';
  brand?:           BrandImageContext;
  referenceImages?: string[];
}

export interface GenerateImageResult {
  b64:           string;
  revisedPrompt: string;
}

// ─── Carousel generation ─────────────────────────────────────────────────────

export interface GenerateCarouselOptions {
  channel:     ContentChannel;
  topic:       string;
  slide_count: number;
  tone?:       string[];
  language?:   'es' | 'en';
  brandName?:  string;
  tagline?:    string;
  extraCtx?:   string;
}

export interface GenerateCarouselResult {
  slides:      CarouselSlide[];
  description: string;
  hashtags:    string[];
  model:       string;
  tokensUsed:  number;
}

// ─── Reel script generation ──────────────────────────────────────────────────

export interface GenerateReelOptions {
  channel:      ContentChannel;
  topic:        string;
  scene_count?: number;
  tone?:        string[];
  language?:    'es' | 'en';
  brandName?:   string;
  tagline?:     string;
  extraCtx?:    string;
}

export interface GenerateReelResult {
  scenes:     ReelScene[];
  hook:       string;
  hashtags:   string[];
  model:      string;
  tokensUsed: number;
}

// ─── Content recommendations ─────────────────────────────────────────────────

export type RecommendedContentType = 'post' | 'carousel' | 'reel' | 'story';

export interface ContentRecommendation {
  topic:           string;
  content_type:    RecommendedContentType;
  rationale_short: string;
}

export interface RecommendBrandContext {
  name?:            string;
  tagline?:         string;
  industry?:        string;
  niche?:           string;
  target_audience?: string;
  mission?:         string;
  differentiators?: string[];
  tone?:            string[];
  language?:        'es' | 'en';
  hint?:            string;
  strategy?: {
    framework_name?: string;
    kpi_primary?:    string;
    current_week?:   number;
    total_weeks?:    number;
    sample_topics?:  string[];
  };
  recent_topics?:   string[];
}

export interface GenerateRecommendationsResult {
  recommendations: ContentRecommendation[];
  model:           string;
  tokensUsed:      number;
}
