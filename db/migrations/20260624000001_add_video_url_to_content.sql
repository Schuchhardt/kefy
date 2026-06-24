-- Add video_url column to store the S3 URL from Remotion Lambda renders.
-- Replaces the Mux pipeline: Lambda renders → S3 URL stored here → passed directly to Zernio.

ALTER TABLE kefy_content_items
  ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN kefy_content_items.video_url IS 'Public S3 URL of the rendered MP4 (from Remotion Lambda). Used for preview and Zernio publishing.';
