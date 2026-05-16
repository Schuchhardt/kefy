-- Migration: 005 — Brand Kit (kefy_brand_kits, kefy_brand_assets)
-- Created: 2026-05-15
--
-- NOTE: Before running this migration, create the Storage bucket in Supabase:
--   Dashboard → Storage → New bucket → name: "kefy-brand-assets" → Public: true

CREATE TABLE IF NOT EXISTS kefy_brand_kits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL UNIQUE REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL DEFAULT 'Mi marca',
  tagline          TEXT,
  industry         TEXT,
  tone             TEXT[]      NOT NULL DEFAULT '{}',
  primary_color    TEXT        CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color  TEXT        CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color     TEXT        CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  font_heading     TEXT,
  font_body        TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_brand_kits_org_idx ON kefy_brand_kits (org_id);

CREATE TRIGGER kefy_brand_kits_updated_at
  BEFORE UPDATE ON kefy_brand_kits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Assets (logos, images) linked to a brand kit, stored in Supabase Storage
CREATE TABLE IF NOT EXISTS kefy_brand_assets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id  UUID        NOT NULL REFERENCES kefy_brand_kits(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL DEFAULT 'other'
                            CHECK (type IN ('logo', 'image', 'icon', 'other')),
  label         TEXT,
  storage_path  TEXT        NOT NULL,
  public_url    TEXT        NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_brand_assets_kit_idx ON kefy_brand_assets (brand_kit_id);
CREATE INDEX IF NOT EXISTS kefy_brand_assets_org_idx ON kefy_brand_assets (org_id);
