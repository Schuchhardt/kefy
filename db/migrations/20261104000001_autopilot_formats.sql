-- ─────────────────────────────────────────────────────────────────────────────
-- Autopilot: formato por regla, mezcla semanal, story derivada y pausa por
-- créditos. Ver lib/services/autopilot.ts y docs/assistant.md («Autopilot»).
-- Created: 2026-11-04
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Reglas ──────────────────────────────────────────────────────────────────
--   format              post | carousel | story | reel. NULL = automático: lo
--                       decide la etiqueta del tema ([REEL 30s]…) o la red
--                       (TikTok/YouTube → reel), como hasta ahora.
--   weekly_formats      Mezcla semanal (solo frecuencia diaria): {"4": "reel",
--                       "0": "skip"} = reel los jueves, nada los domingos y el
--                       resto de días el `format` de la regla.
--   also_story          Además de la pieza, una story derivada de ella
--                       (conversión de formato) en las cuentas con Stories.
--   story_delay_minutes Desfase de esa story respecto de la pieza.
--   paused_reason       Por qué la pausó el sistema (NULL = la pausó alguien).
ALTER TABLE kefy_autopilot_rules
  ADD COLUMN IF NOT EXISTS format TEXT
    CHECK (format IN ('post', 'carousel', 'story', 'reel')),
  ADD COLUMN IF NOT EXISTS weekly_formats JSONB
    CHECK (weekly_formats IS NULL OR jsonb_typeof(weekly_formats) = 'object'),
  ADD COLUMN IF NOT EXISTS also_story BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS story_delay_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (story_delay_minutes BETWEEN 0 AND 10080),
  ADD COLUMN IF NOT EXISTS paused_reason TEXT
    CHECK (paused_reason IN ('credits_exhausted')),
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- El cron busca las pausadas por créditos para reanudarlas al renovarse el mes.
CREATE INDEX IF NOT EXISTS kefy_autopilot_rules_paused_credits
  ON kefy_autopilot_rules (paused_at)
  WHERE status = 'paused' AND paused_reason = 'credits_exhausted';

-- ─── Ejecuciones ─────────────────────────────────────────────────────────────
--   format              Formato que salió en esa ejecución.
--   credits_estimated   Lo que se estimó antes de gastar (pieza + story).
--   video_status        Reels: producing → published | failed | cancelled.
--   video_attempts      Producciones lanzadas (el cron reintenta una vez).
--   story_status        Story derivada: scheduled | published | failed | skipped.
ALTER TABLE kefy_autopilot_runs
  ADD COLUMN IF NOT EXISTS format TEXT
    CHECK (format IN ('post', 'carousel', 'story', 'reel')),
  ADD COLUMN IF NOT EXISTS credits_estimated INTEGER,
  ADD COLUMN IF NOT EXISTS video_status TEXT
    CHECK (video_status IN ('producing', 'published', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS video_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS story_status TEXT
    CHECK (story_status IN ('scheduled', 'published', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS story_scheduled_post_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS story_error TEXT;
