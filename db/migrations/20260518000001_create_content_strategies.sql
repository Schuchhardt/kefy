-- Migration: create_content_strategies
-- Modular strategy template system: objectives × industries → framework + calendar + interaction layers
-- Designed for incremental seeding (new rubros/objectives via INSERT only, no schema changes needed)
-- Created: 2026-05-18

-- ── Objectives catalog ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kefy_content_objectives (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT  NOT NULL UNIQUE,
  name_es     TEXT  NOT NULL,
  name_en     TEXT  NOT NULL,
  desc_es     TEXT,
  desc_en     TEXT,
  icon        TEXT,
  sort_order  INT   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Industries / rubros catalog ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kefy_content_industries (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT  NOT NULL UNIQUE,
  name_es     TEXT  NOT NULL,
  name_en     TEXT  NOT NULL,
  icon        TEXT,
  desc_es     TEXT,
  sort_order  INT   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Content strategies ────────────────────────────────────────────────────────
-- One strategy per (objective, industry) combination.
-- interaction_layers: JSONB array of { "num_es", "num_en", "title_es", "title_en", "items_es": [...], "items_en": [...] }
CREATE TABLE IF NOT EXISTS kefy_content_strategies (
  id                  UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id        UUID  NOT NULL REFERENCES kefy_content_objectives(id) ON DELETE CASCADE,
  industry_id         UUID  NOT NULL REFERENCES kefy_content_industries(id) ON DELETE CASCADE,
  framework_slug      TEXT  NOT NULL,
  framework_name_es   TEXT  NOT NULL,
  framework_name_en   TEXT  NOT NULL,
  framework_desc_es   TEXT,
  framework_desc_en   TEXT,
  kpi_primary_es      TEXT,
  kpi_secondary_es    TEXT,
  kpi_primary_en      TEXT,
  kpi_secondary_en    TEXT,
  interaction_layers  JSONB NOT NULL DEFAULT '[]',
  cta_mechanic_es     TEXT,
  cta_mechanic_en     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (objective_id, industry_id)
);

CREATE INDEX IF NOT EXISTS kefy_content_strategies_obj_idx ON kefy_content_strategies (objective_id);
CREATE INDEX IF NOT EXISTS kefy_content_strategies_ind_idx ON kefy_content_strategies (industry_id);

-- ── Strategy templates (weekly calendar) ─────────────────────────────────────
-- Each row is one content piece in the 4-week calendar for a strategy.
-- format:       e.g. 'carrusel', 'reel', 'post', 'story', 'infografía', 'email'
-- channel_hint: e.g. 'instagram', 'linkedin', 'general'
-- copy_structure: the sub-prompt / angle for IA generation
CREATE TABLE IF NOT EXISTS kefy_strategy_templates (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id      UUID  NOT NULL REFERENCES kefy_content_strategies(id) ON DELETE CASCADE,
  week_num         INT   NOT NULL CHECK (week_num BETWEEN 1 AND 52),
  post_num         INT   NOT NULL DEFAULT 1,
  format           TEXT  NOT NULL,
  channel_hint     TEXT  NOT NULL DEFAULT 'general',
  topic_es         TEXT  NOT NULL,
  copy_structure_es TEXT,
  goal_es          TEXT,
  topic_en         TEXT,
  copy_structure_en TEXT,
  goal_en          TEXT,
  sort_order       INT   NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_strategy_templates_strategy_idx ON kefy_strategy_templates (strategy_id);
CREATE INDEX IF NOT EXISTS kefy_strategy_templates_week_idx     ON kefy_strategy_templates (strategy_id, week_num, sort_order);

-- ── Per-org active strategy selection ────────────────────────────────────────
-- Stores which objective + industry each org has selected, with optional notes.
CREATE TABLE IF NOT EXISTS kefy_org_strategies (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID  NOT NULL UNIQUE REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  objective_id  UUID  REFERENCES kefy_content_objectives(id) ON DELETE SET NULL,
  industry_id   UUID  REFERENCES kefy_content_industries(id) ON DELETE SET NULL,
  strategy_id   UUID  REFERENCES kefy_content_strategies(id) ON DELETE SET NULL,
  custom_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_org_strategies_org_idx ON kefy_org_strategies (org_id);

CREATE TRIGGER kefy_org_strategies_updated_at
  BEFORE UPDATE ON kefy_org_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
