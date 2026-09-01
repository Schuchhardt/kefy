import type { CarouselSlide, ContentType, ReelScene } from '@/types/content';

export type { CarouselSlide, ReelScene } from '@/types/content';

// ─── Contenido de origen (conversiones entre formatos) ───────────────────────

/**
 * La pieza original de la que se deriva otro formato.
 *
 * Cuando se genera, por ejemplo, la versión carrusel de un post, el resultado
 * tiene que ser *ese* post contado como carrusel: mismo mensaje, mismos datos,
 * misma imagen de referencia. Sin este contexto el generador sólo recibía un
 * "tema" recortado y devolvía una pieza nueva sin relación con el original.
 */
export interface SourceContentContext {
  /** Formato del que se parte ('post', 'carousel', 'reel' o 'story'). */
  format:      ContentType;
  title?:      string | null;
  /** Texto completo de la pieza original (no un recorte). */
  body?:       string | null;
  hashtags?:   string[];
  /** Título/cuerpo de cada slide o escena del original, en orden. */
  slideTexts?: string[];
  /** Imágenes del original, usadas como referencia visual al generar. */
  imageUrls?:  string[];
}

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
  /** Pieza original cuando esto es una conversión de formato. */
  source?:    SourceContentContext;
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
  /** Pieza original cuando esto es una conversión de formato. */
  source?:    SourceContentContext;
}

export interface GenerateCarouselResult {
  slides:      CarouselSlide[];
  description: string;
  hashtags:    string[];
  model:       string;
  tokensUsed:  number;
}

// ─── Single slide / scene text regeneration ──────────────────────────────────

export interface GenerateSlideTextOptions {
  /** 'carousel' slide or 'reel' scene — tunes the copy length + style. */
  kind:         'carousel' | 'reel';
  channel:      ContentChannel;
  /** Current title/body of the slide, used as the thing to rewrite. */
  title?:       string;
  body?:        string;
  /** Optional user instruction on what to change. */
  feedback?:    string;
  tone?:        string[];
  language?:    'es' | 'en';
  brandName?:   string;
  tagline?:     string;
}

export interface GenerateSlideTextResult {
  title:      string;
  body:       string;
  model:      string;
  tokensUsed: number;
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
  /** Pieza original cuando esto es una conversión de formato. */
  source?:    SourceContentContext;
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
