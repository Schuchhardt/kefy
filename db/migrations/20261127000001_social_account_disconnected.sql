-- ─────────────────────────────────────────────────────────────────────────────
-- Cuentas que Zernio da por desconectadas (token vencido o revocado, acceso
-- perdido en la red). Ver docs/zernio.md («Cuenta desconectada en Zernio»).
-- Created: 2026-11-27
-- ─────────────────────────────────────────────────────────────────────────────

-- Nuevo motivo de revocación:
--   disconnected  Zernio la tiene desconectada (webhook account.disconnected,
--                 isActive=false en el listado o una publicación rechazada
--                 porque la cuenta está desconectada). Se arregla
--                 reconectándola: Zernio conserva el id y la fila vuelve a
--                 quedar activa.
ALTER TABLE kefy_social_accounts DROP CONSTRAINT IF EXISTS kefy_social_accounts_status_reason_check;
ALTER TABLE kefy_social_accounts ADD CONSTRAINT kefy_social_accounts_status_reason_check
  CHECK (status_reason IN ('missing_in_zernio', 'account_mismatch', 'disconnected'));

-- El motivo que da la red o Zernio («Your instagram access token is no longer
-- valid…»), para que la interfaz y el asistente digan qué pasó.
ALTER TABLE kefy_social_accounts
  ADD COLUMN IF NOT EXISTS status_detail TEXT;
