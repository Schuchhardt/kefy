-- Migration: create kefy_org_invitations
--
-- La página de precios anuncia miembros de equipo por plan, pero no existía
-- ninguna forma de invitar a nadie: `kefy_org_memberships` solo se poblaba con
-- el dueño al registrarse. Esta tabla añade el paso que faltaba.
--
-- El token se guarda hasheado, igual que los de recuperación de contraseña: si
-- alguien lee la base, no puede usar las invitaciones pendientes.
-- Created: 2026-09-01

CREATE TABLE IF NOT EXISTS kefy_org_invitations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('admin', 'member')),
  token_hash    TEXT        NOT NULL UNIQUE,
  invited_by    UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  accepted_by   UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_org_invitations_org_idx   ON kefy_org_invitations(org_id);
CREATE INDEX IF NOT EXISTS kefy_org_invitations_email_idx ON kefy_org_invitations(lower(email));

-- Una sola invitación pendiente por email y organización: reinvitar reemplaza
-- la anterior en lugar de acumular tokens válidos para la misma persona.
CREATE UNIQUE INDEX IF NOT EXISTS kefy_org_invitations_pendiente_idx
  ON kefy_org_invitations(org_id, lower(email))
  WHERE accepted_at IS NULL;

-- El dueño no se invita a sí mismo: se crea con la organización.
-- El rol 'owner' se excluye del CHECK a propósito — no se transfiere por invitación.
