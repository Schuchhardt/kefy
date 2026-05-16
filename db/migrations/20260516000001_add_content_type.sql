-- Migration: add content_type, slides, and video_url to kefy_content_items
-- Created: 2026-05-16
--
-- content_type distinguishes between single posts, carousels (multi-slide), and reels.
-- slides stores the structured JSON array for carousels:
--   [{ "slide_order": 1, "title": "...", "body": "...", "image_url": "...", "image_prompt": "..." }]
-- video_url stores the final rendered video asset URL for reels.

ALTER TABLE kefy_content_items
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'post'
    CHECK (content_type IN ('post', 'carousel', 'reel')),
  ADD COLUMN IF NOT EXISTS slides    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS video_url TEXT  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS kefy_content_items_type_idx
  ON kefy_content_items (org_id, content_type);
