-- Ficha de prospecto del pipeline comercial (MCP admin).
--
--   * domain: host del sitio web sin «www.», para deduplicar empresas por
--     dominio (además de email e Instagram). Los hosts compartidos (linktr.ee,
--     instagram.com, wa.me…) quedan en NULL: no identifican a nadie.
--   * source_url: la página donde se encontró al prospecto.
--   * contacts: personas de la empresa, cada una con la URL de donde salió el
--     dato ([{ name, role, email, phone, instagram, linkedin, source_url, note }]).
--   * signals: por qué es buen prospecto ([{ type, detail, source_url,
--     observed_at }]), p. ej. «publica poco», «abrió local nuevo».
--   * sequence_step: último paso de la secuencia de contacto registrado, en el
--     lead y en cada actividad.
--
-- Ver docs/admin-mcp.md.
-- Created: 2026-11-11

ALTER TABLE kefy_sales_leads
  ADD COLUMN IF NOT EXISTS domain        TEXT     CHECK (domain IS NULL OR char_length(domain) <= 253),
  ADD COLUMN IF NOT EXISTS source_url    TEXT     CHECK (source_url IS NULL OR char_length(source_url) <= 1000),
  ADD COLUMN IF NOT EXISTS contacts      JSONB    NOT NULL DEFAULT '[]'::jsonb
                                                  CHECK (jsonb_typeof(contacts) = 'array' AND jsonb_array_length(contacts) <= 20),
  ADD COLUMN IF NOT EXISTS signals       JSONB    NOT NULL DEFAULT '[]'::jsonb
                                                  CHECK (jsonb_typeof(signals) = 'array' AND jsonb_array_length(signals) <= 50),
  ADD COLUMN IF NOT EXISTS sequence_step SMALLINT NOT NULL DEFAULT 0 CHECK (sequence_step BETWEEN 0 AND 20);

-- Un lead por dominio, igual que por email e Instagram.
CREATE UNIQUE INDEX IF NOT EXISTS kefy_sales_leads_domain_uniq ON kefy_sales_leads (domain) WHERE domain IS NOT NULL;

ALTER TABLE kefy_sales_lead_activities
  ADD COLUMN IF NOT EXISTS sequence_step SMALLINT CHECK (sequence_step IS NULL OR sequence_step BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS contact_name  TEXT     CHECK (contact_name IS NULL OR char_length(contact_name) <= 200);
