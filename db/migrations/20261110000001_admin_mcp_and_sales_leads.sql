-- Migration: MCP de administración de la plataforma (/api/admin/mcp)
--
--   * kefy_api_keys / kefy_oauth_codes admiten el scope 'admin'. Solo lo emite
--     el consentimiento OAuth cuando el recurso pedido es /api/admin/mcp y el
--     email de quien autoriza está en KEFY_ADMIN_EMAILS. Una conexión admin
--     lleva SOLO ese scope: no sirve en /api/mcp y una conexión normal no
--     sirve en /api/admin/mcp.
--   * kefy_admin_audit_log: toda escritura del MCP admin (quién, qué, por qué).
--   * kefy_admin_org_notes: notas internas de soporte sobre una organización.
--   * kefy_sales_leads (+ actividades y supresiones): el pipeline comercial de
--     Kefy — usuarios de la plataforma (trial, trial vencido, pago fallido…) y
--     prospección en frío cargada por MCP — para ofrecer la plataforma y/o el
--     servicio de gestión de cuentas y contenido. NO se envía nada desde aquí:
--     el dueño escribe a mano. No confundir con kefy_leads, que son los leads
--     de la marca de cada cliente.
--
-- Ver docs/admin-mcp.md.
-- Created: 2026-11-10

-- ─── Scope 'admin' ───────────────────────────────────────────────────────────

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conrelid::regclass::text AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('kefy_api_keys'::regclass, 'kefy_oauth_codes'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%scopes%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE kefy_api_keys ADD CONSTRAINT kefy_api_keys_scopes_check
  CHECK (cardinality(scopes) > 0
         AND scopes <@ ARRAY['read','write','publish','admin']::TEXT[]
         -- 'admin' nunca se mezcla con los scopes de una organización.
         AND (NOT ('admin' = ANY(scopes)) OR scopes = ARRAY['admin']::TEXT[]));

ALTER TABLE kefy_oauth_codes ADD CONSTRAINT kefy_oauth_codes_scopes_check
  CHECK (cardinality(scopes) > 0
         AND scopes <@ ARRAY['read','write','publish','admin']::TEXT[]
         AND (NOT ('admin' = ANY(scopes)) OR scopes = ARRAY['admin']::TEXT[]));

-- ─── Auditoría y notas ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_admin_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  admin_email    TEXT        NOT NULL,
  api_key_id     UUID        REFERENCES kefy_api_keys(id) ON DELETE SET NULL,
  tool_name      TEXT        NOT NULL,
  input          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  reason         TEXT,
  target_org_id  UUID        REFERENCES kefy_organizations(id) ON DELETE SET NULL,
  status         TEXT        NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error          TEXT,
  -- Hash del confirmation_token usado: un token confirma una sola ejecución.
  confirmation_hash TEXT     UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_admin_audit_log_created_idx ON kefy_admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS kefy_admin_audit_log_org_idx ON kefy_admin_audit_log (target_org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kefy_admin_org_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_admin_org_notes_org_idx ON kefy_admin_org_notes (org_id, created_at DESC);

-- ─── Pipeline comercial ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_sales_leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- kefy_account: una organización que ya usa Kefy. outreach: prospección en frío.
  kind                 TEXT        NOT NULL CHECK (kind IN ('kefy_account', 'outreach')),
  org_id               UUID        REFERENCES kefy_organizations(id) ON DELETE SET NULL,
  name                 TEXT        CHECK (name IS NULL OR char_length(name) <= 200),
  company              TEXT        CHECK (company IS NULL OR char_length(company) <= 200),
  email                TEXT        CHECK (email IS NULL OR char_length(email) <= 320),
  phone                TEXT        CHECK (phone IS NULL OR char_length(phone) <= 50),
  website              TEXT        CHECK (website IS NULL OR char_length(website) <= 500),
  instagram            TEXT        CHECK (instagram IS NULL OR char_length(instagram) <= 100),
  social_links         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  city                 TEXT,
  country              TEXT,
  industry             TEXT,
  followers            INTEGER     CHECK (followers IS NULL OR followers >= 0),
  source               TEXT        NOT NULL DEFAULT 'manual' CHECK (char_length(source) BETWEEN 1 AND 100),
  -- Para kefy_account: por qué es un lead (trial_ending, trial_expired…).
  segment              TEXT,
  offer                TEXT        CHECK (offer IN ('platform', 'managed_service', 'both')),
  stage                TEXT        NOT NULL DEFAULT 'new'
                                   CHECK (stage IN ('new', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost')),
  priority             TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  estimated_value_usd  NUMERIC(10, 2) CHECK (estimated_value_usd IS NULL OR estimated_value_usd >= 0),
  next_action          TEXT        CHECK (next_action IS NULL OR char_length(next_action) <= 500),
  next_action_at       TIMESTAMPTZ,
  last_contacted_at    TIMESTAMPTZ,
  lost_reason          TEXT,
  tags                 TEXT[]      NOT NULL DEFAULT '{}',
  notes                TEXT        CHECK (notes IS NULL OR char_length(notes) <= 5000),
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un lead por organización, por email y por cuenta de Instagram.
CREATE UNIQUE INDEX IF NOT EXISTS kefy_sales_leads_org_uniq ON kefy_sales_leads (org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kefy_sales_leads_email_uniq ON kefy_sales_leads (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kefy_sales_leads_instagram_uniq ON kefy_sales_leads (instagram) WHERE instagram IS NOT NULL;
CREATE INDEX IF NOT EXISTS kefy_sales_leads_stage_idx ON kefy_sales_leads (stage, next_action_at);

CREATE TABLE IF NOT EXISTS kefy_sales_lead_activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL REFERENCES kefy_sales_leads(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL
                          CHECK (type IN ('note', 'email', 'call', 'whatsapp', 'dm', 'meeting', 'stage_change', 'other')),
  direction   TEXT        CHECK (direction IN ('outbound', 'inbound')),
  body        TEXT        CHECK (body IS NULL OR char_length(body) <= 5000),
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_sales_lead_activities_lead_idx ON kefy_sales_lead_activities (lead_id, created_at DESC);

-- «No me escriban más»: email exacto, dominio (@empresa.cl), teléfono o Instagram.
CREATE TABLE IF NOT EXISTS kefy_sales_suppressions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT        NOT NULL CHECK (kind IN ('email', 'domain', 'phone', 'instagram')),
  value       TEXT        NOT NULL CHECK (char_length(value) BETWEEN 1 AND 320),
  reason      TEXT,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- Solo el servidor (service role) lee y escribe estas tablas.
ALTER TABLE kefy_admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kefy_admin_org_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kefy_sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE kefy_sales_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE kefy_sales_suppressions ENABLE ROW LEVEL SECURITY;
