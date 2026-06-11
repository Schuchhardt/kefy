-- Migration: backfill missing brands/brand kits for legacy organizations
-- Created: 2026-06-11

-- 1) Ensure every organization has at least one brand.
-- Uses org slug/name to keep deterministic identity for starter accounts.
INSERT INTO kefy_brands (org_id, name, slug)
SELECT o.id, o.name, o.slug
FROM kefy_organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM kefy_brands b
  WHERE b.org_id = o.id
)
ON CONFLICT (slug) DO NOTHING;

-- 2) Ensure every brand has a brand kit row.
INSERT INTO kefy_brand_kits (org_id, brand_id, name)
SELECT b.org_id, b.id, b.name
FROM kefy_brands b
WHERE NOT EXISTS (
  SELECT 1
  FROM kefy_brand_kits bk
  WHERE bk.brand_id = b.id
)
ON CONFLICT (brand_id) DO NOTHING;
