-- Migration: 002 — Create kefy_blog_posts table
-- Created: 2026-05-14

CREATE TABLE IF NOT EXISTS kefy_blog_posts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT        NOT NULL,
  lang         TEXT        NOT NULL CHECK (lang IN ('es', 'en')),
  title        TEXT        NOT NULL,
  excerpt      TEXT,
  content      TEXT        NOT NULL DEFAULT '',
  author       TEXT,
  cover_url    TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (slug, lang)
);

-- Index for fast lookups by slug + lang (used on post detail page)
CREATE INDEX IF NOT EXISTS kefy_blog_posts_slug_lang_idx ON kefy_blog_posts (slug, lang);

-- Index for listing pages ordered by date
CREATE INDEX IF NOT EXISTS kefy_blog_posts_lang_date_idx ON kefy_blog_posts (lang, published_at DESC);
