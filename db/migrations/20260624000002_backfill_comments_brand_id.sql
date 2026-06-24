-- Migration: backfill brand_id on kefy_comments and kefy_messages for rows
-- inserted by the Zernio webhook before the fix that populates brand_id.
--
-- These rows have brand_id = NULL but can be resolved via their social_account_id
-- → kefy_social_accounts.brand_id.

UPDATE kefy_comments c
SET brand_id = sa.brand_id
FROM kefy_social_accounts sa
WHERE sa.id = c.social_account_id
  AND c.brand_id IS NULL
  AND sa.brand_id IS NOT NULL;

UPDATE kefy_messages m
SET brand_id = sa.brand_id
FROM kefy_social_accounts sa
WHERE sa.id = m.social_account_id
  AND m.brand_id IS NULL
  AND sa.brand_id IS NOT NULL;
