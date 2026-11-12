-- Marca de demostración enlazada a un prospecto (MCP admin).
--
-- El dueño de Kefy crea para un prospecto una marca de ejemplo (su web leída +
-- 3 posts) en la organización de demos (KEFY_DEMO_ORG_ID) y le manda un link
-- público de solo lectura para que vea cómo se vería su negocio.
--
--   * kefy_sales_leads.demo_brand_id: la marca demo del prospecto.
--   * kefy_demo_previews: links públicos. Solo se guarda el hash del token; la
--     URL se muestra una vez al crearla. Vencen, se revocan y cuentan visitas.
--
-- Ver docs/admin-mcp.md.
-- Created: 2026-11-11

ALTER TABLE kefy_sales_leads
  ADD COLUMN IF NOT EXISTS demo_brand_id UUID REFERENCES kefy_brands(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS kefy_demo_previews (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES kefy_sales_leads(id) ON DELETE CASCADE,
  brand_id        UUID        NOT NULL REFERENCES kefy_brands(id) ON DELETE CASCADE,
  -- sha256 (hex) del token de la URL.
  token_hash      TEXT        NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  -- Primeros caracteres del token, para reconocer el link sin poder usarlo.
  token_prefix    TEXT        NOT NULL CHECK (char_length(token_prefix) BETWEEN 4 AND 8),
  lang            TEXT        NOT NULL DEFAULT 'es' CHECK (lang IN ('es', 'en')),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  views           INTEGER     NOT NULL DEFAULT 0 CHECK (views >= 0),
  last_viewed_at  TIMESTAMPTZ,
  created_by      TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_demo_previews_lead_idx ON kefy_demo_previews (lead_id, created_at DESC);

-- Solo el servidor (service role) lee y escribe.
ALTER TABLE kefy_demo_previews ENABLE ROW LEVEL SECURITY;
