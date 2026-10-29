-- Migration: varios logos e íconos por marca, clasificados al subirlos
-- Cada marca puede tener varias versiones de su logo (horizontal, vertical,
-- para fondo claro u oscuro) y varios íconos. Al subir una imagen Kefy la
-- mide (lib/brand-logos.ts) y guarda:
--   variant     forma del contenido, sin márgenes: horizontal, vertical o square
--   background  fondo para el que está pensada: light, dark o any
--   width/height tamaño en píxeles del archivo
--   source_asset_id  el logo del que se recortó un ícono
--   source_url   la URL de la que se importó (la web de la marca): leer la
--                misma web dos veces no duplica los logos
-- La persona puede corregir la clasificación; kefy_brand_kits.logo_url sigue
-- siendo el logo principal que usa la generación.
-- Created: 2026-10-28

ALTER TABLE kefy_brand_assets
  ADD COLUMN IF NOT EXISTS variant         TEXT CHECK (variant IN ('horizontal', 'vertical', 'square')),
  ADD COLUMN IF NOT EXISTS background      TEXT CHECK (background IN ('light', 'dark', 'any')),
  ADD COLUMN IF NOT EXISTS width           INTEGER,
  ADD COLUMN IF NOT EXISTS height          INTEGER,
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES kefy_brand_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url      TEXT;
