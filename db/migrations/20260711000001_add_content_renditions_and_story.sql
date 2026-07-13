-- Migration: content renditions + Story format
-- Created: 2026-07-11
--
-- Decouples "topic" from "format": a content item keeps its primary
-- format (content_type) exactly as before, and kefy_content_renditions
-- stores additional formats (post/carousel/reel/story) generated on
-- demand for the same item, so the same topic can be published as
-- different formats depending on the target social network.

-- Allow 'story' alongside the existing formats.
ALTER TABLE kefy_content_items
  DROP CONSTRAINT IF EXISTS kefy_content_items_content_type_check;
ALTER TABLE kefy_content_items
  ADD CONSTRAINT kefy_content_items_content_type_check
    CHECK (content_type IN ('post', 'carousel', 'reel', 'story'));

CREATE TABLE IF NOT EXISTS kefy_content_renditions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  UUID        NOT NULL REFERENCES kefy_content_items(id) ON DELETE CASCADE,
  format           TEXT        NOT NULL CHECK (format IN ('post', 'carousel', 'reel', 'story')),
  status           TEXT        NOT NULL DEFAULT 'ready'
                                CHECK (status IN ('pending', 'generating', 'ready', 'error')),
  body             TEXT,
  hashtags         TEXT[]      NOT NULL DEFAULT '{}',
  image_url        TEXT,
  slides           JSONB,
  video_url        TEXT,
  mux_playback_id  TEXT,
  mux_asset_id     TEXT,
  render_status    TEXT        CHECK (render_status IN ('not_rendered', 'rendering', 'ready', 'error')),
  metadata         JSONB       NOT NULL DEFAULT '{}',
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, format)
);

CREATE INDEX IF NOT EXISTS kefy_content_renditions_item_idx ON kefy_content_renditions (content_item_id);

CREATE TRIGGER kefy_content_renditions_updated_at
  BEFORE UPDATE ON kefy_content_renditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill: every existing content item already "is" its own primary rendition.
INSERT INTO kefy_content_renditions
  (content_item_id, format, status, body, hashtags, image_url, slides, video_url,
   mux_playback_id, mux_asset_id, render_status)
SELECT id, content_type, 'ready', body, hashtags, image_url, slides, video_url,
       mux_playback_id, mux_asset_id, COALESCE(render_status, 'not_rendered')
FROM kefy_content_items
ON CONFLICT (content_item_id, format) DO NOTHING;

-- Track which format was actually published for a given scheduled/published post.
ALTER TABLE kefy_scheduled_posts ADD COLUMN IF NOT EXISTS format TEXT;
UPDATE kefy_scheduled_posts sp
  SET format = ci.content_type
  FROM kefy_content_items ci
  WHERE ci.id = sp.content_item_id AND sp.format IS NULL;
