import type { ContentType } from '@/types/content';

// ─── Strategy catalog entities ───────────────────────────────────────────────

export interface Objective {
  id:      string;
  slug:    string;
  name_es: string;
  name_en: string;
  desc_es: string;
  desc_en: string;
  icon:    string;
}

export interface Industry {
  id:      string;
  slug:    string;
  name_es: string;
  name_en: string;
  icon:    string;
  desc_es: string;
}

export interface Strategy {
  id:                 string;
  framework_slug:     string;
  framework_name_es:  string;
  framework_name_en:  string;
  framework_desc_es:  string;
  framework_desc_en:  string;
  kpi_primary_es:     string;
  kpi_primary_en:     string;
  kpi_secondary_es:   string;
  kpi_secondary_en:   string;
  interaction_layers: Array<{
    num_es:   string;
    num_en:   string;
    title_es: string;
    title_en: string;
    items_es: string[];
    items_en: string[];
  }>;
  cta_mechanic_es:    string;
  cta_mechanic_en:    string;
}

export interface StrategyTemplate {
  id:                string;
  week_num:          number;
  post_num:          number;
  format:            string;
  channel_hint:      string;
  topic_es:          string;
  topic_en:          string;
  copy_structure_es: string;
  copy_structure_en: string;
  goal_es:           string;
  goal_en:           string;
}

/** Alias kept for callers that originally named it `Template`. */
export type Template = StrategyTemplate;

export interface OrgSelection {
  objective_id: string | null;
  industry_id:  string | null;
  strategy_id:  string | null;
  custom_notes: string | null;
}

// ─── Recommendation block (strategy → content/create page) ───────────────────

export type RecSource = 'strategy' | 'industry_fallback' | 'ai_only';

export interface RecRationale {
  source:           RecSource;
  framework_name?:  string;
  kpi_primary?:     string;
  goal?:            string;
  week_num?:        number;
  post_num?:        number;
  rationale_short?: string;
}

export interface Recommendation {
  template_id?:    string;
  week_num?:       number;
  post_num?:       number;
  format?:         string;
  topic:           string;
  content_type:    ContentType;
  slide_count?:    number;
  generate_images: true;
  rationale:       RecRationale;
}

export interface StrategyMeta {
  framework_name: string;
  kpi_primary:    string;
  current_week:   number;
  total_weeks:    number;
}

// ─── Server-side strategy context (api/content/recommend) ────────────────────

export interface StrategyCtx {
  strategy_id:    string;
  framework_slug: string;
  framework_name: string;
  kpi_primary:    string;
  current_week:   number;
  total_weeks:    number;
  template_pool:  StrategyTemplate[];
}

export interface AiRunOpts {
  brandKitRow:   import('@/types/db').BrandKitRow | null;
  language:      'es' | 'en';
  hint?:         string;
  recentTopics?: string[];
  count?:        number;
  strategyCtx?:  StrategyCtx;
}

export interface LoadStrategyCtxOpts {
  orgId:   string;
  brandId: string;
  lang:    'es' | 'en';
}

export interface LoadStrategyOpts {
  orgId:   string;
  brandId: string;
  lang:    'es' | 'en';
  hint?:   string;
}
