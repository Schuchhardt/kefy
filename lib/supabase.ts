import { createClient } from '@supabase/supabase-js';

export function createSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(url, key);
}

export interface BlogPost {
  id: string;
  slug: string;
  lang: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  published_at: string;
  cover_url: string | null;
}
