-- Migration: 008 — Extend Brand Kit with identity & market fields
-- Created: 2026-05-15

ALTER TABLE kefy_brand_kits
  -- Sección 1: Quién eres
  ADD COLUMN IF NOT EXISTS website_url          TEXT,
  ADD COLUMN IF NOT EXISTS social_urls          JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS language             TEXT         NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS customer_locations   TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uses_emojis          BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS communication_style  TEXT,
  ADD COLUMN IF NOT EXISTS mission              TEXT,

  -- Sección 2: Tu mercado
  ADD COLUMN IF NOT EXISTS company_size         TEXT         CHECK (company_size IS NULL OR company_size IN ('1-10','11-50','51-200','201-500','500+')),
  ADD COLUMN IF NOT EXISTS differentiators      TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS challenges           TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS niche                TEXT,
  ADD COLUMN IF NOT EXISTS competitors          TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_audience      TEXT;
