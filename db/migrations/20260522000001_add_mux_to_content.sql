-- Add Mux video hosting columns to kefy_content_items
-- These support the reel render pipeline:
-- 1. User triggers render → @remotion/renderer generates MP4
-- 2. MP4 is uploaded to Mux → mux_asset_id returned
-- 3. Once Mux processes the video → mux_playback_id available for streaming

ALTER TABLE kefy_content_items
  ADD COLUMN IF NOT EXISTS mux_asset_id   TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT,
  ADD COLUMN IF NOT EXISTS render_status  TEXT DEFAULT 'not_rendered'
    CHECK (render_status IN ('not_rendered', 'rendering', 'ready', 'error'));

COMMENT ON COLUMN kefy_content_items.mux_asset_id    IS 'Mux asset ID after video is uploaded';
COMMENT ON COLUMN kefy_content_items.mux_playback_id IS 'Mux playback ID used for HLS streaming and thumbnails';
COMMENT ON COLUMN kefy_content_items.render_status   IS 'State of the video render pipeline';

-- Index for querying items that are being rendered
CREATE INDEX IF NOT EXISTS kefy_content_items_render_status_idx
  ON kefy_content_items (render_status)
  WHERE render_status IN ('rendering', 'ready');
