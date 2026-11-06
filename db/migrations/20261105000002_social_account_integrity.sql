-- ─────────────────────────────────────────────────────────────────────────────
-- Cuentas sociales que dejan de coincidir con Zernio y reglas de autopilot que
-- se quedan sin cuenta. Ver docs/zernio.md («Integridad de las cuentas»).
-- Created: 2026-11-05
-- ─────────────────────────────────────────────────────────────────────────────

-- Por qué la revocó la comparación diaria con Zernio (NULL = no fue ella).
--   missing_in_zernio  El id guardado ya no existe en Zernio.
--   account_mismatch   El id existe, pero es de otra cuenta: publicar saldría
--                      en un perfil distinto del que muestra Kefy.
ALTER TABLE kefy_social_accounts
  ADD COLUMN IF NOT EXISTS status_reason TEXT
    CHECK (status_reason IN ('missing_in_zernio', 'account_mismatch'));

-- Cuentas que la regla perdió: [{"platform": "instagram", "username": "acme"}].
-- Al reconectar esa misma cuenta, la regla la recupera.
ALTER TABLE kefy_autopilot_rules
  ADD COLUMN IF NOT EXISTS lost_accounts JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE kefy_autopilot_rules DROP CONSTRAINT IF EXISTS kefy_autopilot_rules_paused_reason_check;
ALTER TABLE kefy_autopilot_rules ADD CONSTRAINT kefy_autopilot_rules_paused_reason_check
  CHECK (paused_reason IN ('credits_exhausted', 'no_accounts'));
