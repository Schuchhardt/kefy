-- Migration: add zernio_profile_id to kefy_organizations
-- Stores the Zernio profile ID for each organization (brand).
-- Required to connect social accounts via the Zernio API.

ALTER TABLE kefy_organizations
  ADD COLUMN IF NOT EXISTS zernio_profile_id TEXT;
