// Brand Kit types — mirror kefy_brand_kits and kefy_brand_assets tables

export type BrandTone =
  | 'professional'
  | 'friendly'
  | 'authoritative'
  | 'playful'
  | 'inspirational'
  | 'educational'
  | 'casual'
  | 'formal';

export type AssetType = 'logo' | 'image' | 'icon' | 'other';

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '500+';

export interface SocialUrls {
  instagram?: string;
  linkedin?:  string;
  twitter?:   string;
  facebook?:  string;
  tiktok?:    string;
  threads?:   string;
  youtube?:   string;
  [key: string]: string | undefined;
}

export interface BrandKit {
  id:                   string;
  org_id:               string;
  // Sección 1: Quién eres
  name:                 string;
  tagline:              string | null;
  industry:             string | null;
  website_url:          string | null;
  social_urls:          SocialUrls;
  language:             string;
  customer_locations:   string[];
  uses_emojis:          boolean;
  communication_style:  string | null;
  mission:              string | null;
  tone:                 BrandTone[];
  primary_color:        string | null;
  secondary_color:      string | null;
  accent_color:         string | null;
  font_heading:         string | null;
  font_body:            string | null;
  logo_url:             string | null;
  notes:                string | null;
  // Sección 2: Tu mercado
  company_size:         CompanySize | null;
  differentiators:      string[];
  challenges:           string[];
  niche:                string | null;
  competitors:          string[];
  target_audience:      string | null;
  created_at:           string;
  updated_at:           string;
}

export interface BrandAsset {
  id:           string;
  brand_kit_id: string;
  org_id:       string;
  type:         AssetType;
  label:        string | null;
  storage_path: string;
  public_url:   string;
  file_size:    number | null;
  mime_type:    string | null;
  created_at:   string;
}

export type BrandKitUpdateInput = Partial<
  Pick<
    BrandKit,
    | 'name'
    | 'tagline'
    | 'industry'
    | 'website_url'
    | 'social_urls'
    | 'language'
    | 'customer_locations'
    | 'uses_emojis'
    | 'communication_style'
    | 'mission'
    | 'tone'
    | 'primary_color'
    | 'secondary_color'
    | 'accent_color'
    | 'font_heading'
    | 'font_body'
    | 'logo_url'
    | 'notes'
    | 'company_size'
    | 'differentiators'
    | 'challenges'
    | 'niche'
    | 'competitors'
    | 'target_audience'
  >
>;
