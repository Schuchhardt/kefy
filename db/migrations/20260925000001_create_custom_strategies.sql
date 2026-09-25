-- Migration: create kefy_custom_strategies
-- Estrategias de contenido propias de una organización, además del catálogo
-- (kefy_content_strategies). Las crea el usuario en /brand/strategy o el
-- asistente (save_custom_strategy), y se activan igual que las del catálogo.
--
-- Tabla aparte y no filas con org_id en kefy_content_strategies: el catálogo
-- se consulta por (objetivo, industria) en varios sitios, y mezclar filas
-- privadas ahí haría que una org pudiera recibir la estrategia de otra.
--
-- El calendario va en JSONB (una entrada por pieza):
--   { "week": 1..12, "format": "post"|"carousel"|"reel"|"story",
--     "channel": "instagram"|..."general", "topic": "...", "angle": "...", "goal": "..." }
-- El texto está en un solo idioma (el de quien la escribió).
-- Created: 2026-09-25

CREATE TABLE IF NOT EXISTS kefy_custom_strategies (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description           TEXT,
  objective_id          UUID        REFERENCES kefy_content_objectives(id) ON DELETE SET NULL,
  based_on_strategy_id  UUID        REFERENCES kefy_content_strategies(id) ON DELETE SET NULL,
  kpi_primary           TEXT,
  kpi_secondary         TEXT,
  cta_mechanic          TEXT,
  calendar              JSONB       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(calendar) = 'array'),
  created_by            UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  -- Origen de la creación y de la última edición. El asistente trata como no
  -- confiable el texto que entró por la API o MCP.
  created_via           TEXT        NOT NULL DEFAULT 'ui' CHECK (created_via IN ('ui', 'chat', 'api', 'mcp')),
  updated_via           TEXT        NOT NULL DEFAULT 'ui' CHECK (updated_via IN ('ui', 'chat', 'api', 'mcp')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_custom_strategies_org_idx ON kefy_custom_strategies (org_id, updated_at DESC);

CREATE TRIGGER kefy_custom_strategies_updated_at
  BEFORE UPDATE ON kefy_custom_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- La selección de la org puede apuntar a una estrategia propia. Si está
-- puesta, manda sobre strategy_id (el catálogo). Al borrar la estrategia
-- propia, la org vuelve a la del catálogo que tuviera.
ALTER TABLE kefy_org_strategies
  ADD COLUMN IF NOT EXISTS custom_strategy_id UUID REFERENCES kefy_custom_strategies(id) ON DELETE SET NULL;
