-- Track the state of the async cover-image generation pipeline for content items.
-- Without this, a page reload during generation loses all "pending" context
-- (it lived only in client-side React state) and the missing image reads as
-- a silent failure instead of work still in progress.

ALTER TABLE kefy_content_items
  ADD COLUMN IF NOT EXISTS image_status TEXT
    CHECK (image_status IN ('generating', 'ready', 'error'));

COMMENT ON COLUMN kefy_content_items.image_status IS 'State of the async cover-image generation pipeline (NULL = no generation in flight)';

-- Index for querying items whose image is still being generated
CREATE INDEX IF NOT EXISTS kefy_content_items_image_status_idx
  ON kefy_content_items (image_status)
  WHERE image_status = 'generating';
