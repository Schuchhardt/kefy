import type { ContentType } from '@/types/content';

export interface LibraryItem {
  id:           string;
  industry_id:  string;
  content_type: ContentType;
  title:        string;
  body:         string;
  hashtags:     string[];
  image_url:    string | null;
  image_prompt: string | null;
  slides:       unknown[] | null;
  source:       'seed' | 'cron_generated';
  language:     'es' | 'en';
  created_at:   string;
}

export interface LibraryItemWithIndustry extends LibraryItem {
  industry_slug: string;
  industry_name: string;
  industry_icon: string;
}
