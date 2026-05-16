-- Add logo_url column to kefy_brand_kits
ALTER TABLE kefy_brand_kits
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
