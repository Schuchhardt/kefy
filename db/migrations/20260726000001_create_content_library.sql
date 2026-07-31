-- Migration: create kefy_content_library table
-- Global (not org-scoped) library of template content items organized by industry
-- Created: 2026-07-26

CREATE TABLE IF NOT EXISTS kefy_content_library (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_id   UUID        NOT NULL REFERENCES kefy_content_industries(id) ON DELETE CASCADE,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('post', 'carousel', 'reel', 'story')),
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,
  hashtags      TEXT[]      NOT NULL DEFAULT '{}',
  image_url     TEXT,
  image_prompt  TEXT,
  slides        JSONB,
  source        TEXT        NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'cron_generated')),
  language      TEXT        NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_library_industry ON kefy_content_library(industry_id);
CREATE INDEX idx_content_library_industry_created ON kefy_content_library(industry_id, created_at DESC);
CREATE INDEX idx_content_library_type ON kefy_content_library(content_type);
CREATE INDEX idx_content_library_created ON kefy_content_library(created_at DESC);
