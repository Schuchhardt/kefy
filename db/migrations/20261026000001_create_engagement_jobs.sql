-- Respuestas automáticas con espera (kefy_engagement_rules.delay_minutes > 0).
--
-- Antes el executor se saltaba toda regla con espera: la UI la ofrecía y la
-- regla no respondía nunca. Ahora el webhook encola el evento aquí y el cron
-- /api/automations/engagement/run lo ejecuta cuando vence run_at.
--
-- event_key es el id del comentario o del mensaje en la red: con
-- UNIQUE (rule_id, event_key) un webhook repetido no encola dos veces.

CREATE TABLE IF NOT EXISTS kefy_engagement_jobs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  brand_id    UUID        REFERENCES kefy_brands(id) ON DELETE CASCADE,
  rule_id     UUID        NOT NULL REFERENCES kefy_engagement_rules(id) ON DELETE CASCADE,
  event_key   TEXT        NOT NULL,
  event       JSONB       NOT NULL,
  run_at      TIMESTAMPTZ NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'skipped', 'failed')),
  attempts    INT         NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_id, event_key)
);

CREATE INDEX IF NOT EXISTS kefy_engagement_jobs_due_idx
  ON kefy_engagement_jobs (status, run_at);

-- El pack de comunidad prometía responder menciones, que no llegan por webhook.
UPDATE kefy_automation_packs
  SET desc_es = 'Aumenta la interacción orgánica respondiendo automáticamente a los comentarios.',
      desc_en = 'Boost organic interaction by automatically replying to comments.'
  WHERE name_en = 'Community & Reach';
