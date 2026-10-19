-- Migration: pipeline de video (guion → herramientas → montaje)
--
-- Un reel ya no se renderiza directo desde sus slides: su guion
-- (metadata.video_script) se compila en un plan de pasos — generar imagen,
-- voz, animar, lipsync, montar — que corren en la nube (OpenAI, fal.ai,
-- Remotion Lambda). Ver lib/video/* y docs/video-pipeline.md.
--
-- kefy_video_jobs   — una producción de un item (o de una rendición).
-- kefy_video_steps  — cada llamada a una herramienta, con sus dependencias.
--
-- Los pasos son filas (no un JSONB en el job) porque el motor los reclama de
-- a uno con un UPDATE condicional (status = 'pending' → 'running'): el
-- polling del navegador, el cron y el webhook del proveedor pueden avanzar el
-- mismo trabajo a la vez sin disparar dos veces el mismo paso.
-- Created: 2026-10-19

CREATE TABLE IF NOT EXISTS kefy_video_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  brand_id        UUID,
  created_by      UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  -- Qué fila recibe el video: el item o una de sus rendiciones.
  target_table    TEXT        NOT NULL CHECK (target_table IN ('kefy_content_items', 'kefy_content_renditions')),
  target_id       UUID        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed', 'canceled')),
  motion          TEXT        NOT NULL DEFAULT 'key' CHECK (motion IN ('none', 'key', 'full')),
  -- Copia del guion con el que se compiló el plan: editar la pieza después
  -- no cambia lo que este trabajo está produciendo.
  script          JSONB       NOT NULL,
  -- Contexto del montaje (marca, música) resuelto al crear el trabajo.
  render_context  JSONB       NOT NULL DEFAULT '{}',
  credits_estimate INTEGER    NOT NULL DEFAULT 0,
  video_url       TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS kefy_video_jobs_target_idx ON kefy_video_jobs (target_table, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kefy_video_jobs_running_idx ON kefy_video_jobs (status, updated_at) WHERE status = 'running';

CREATE TRIGGER kefy_video_jobs_updated_at
  BEFORE UPDATE ON kefy_video_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS kefy_video_steps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID        NOT NULL REFERENCES kefy_video_jobs(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  key             TEXT        NOT NULL,
  tool            TEXT        NOT NULL,
  scene_id        TEXT,
  input           JSONB       NOT NULL DEFAULT '{}',
  depends_on      TEXT[]      NOT NULL DEFAULT '{}',
  optional        BOOLEAN     NOT NULL DEFAULT true,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  output          JSONB,
  -- Referencia del trabajo en el proveedor (request_id de fal, renderId de Lambda).
  handle          JSONB,
  attempts        INTEGER     NOT NULL DEFAULT 0,
  -- true mientras los créditos del paso estén descontados (se devuelven si falla).
  charged         BOOLEAN     NOT NULL DEFAULT false,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, key)
);

CREATE INDEX IF NOT EXISTS kefy_video_steps_job_idx ON kefy_video_steps (job_id);

CREATE TRIGGER kefy_video_steps_updated_at
  BEFORE UPDATE ON kefy_video_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Voces (wav) y clips generados. Público como kefy-content-images: Remotion
-- Lambda y los proveedores (fal.ai) descargan estas URLs sin credenciales.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kefy-video-assets', 'kefy-video-assets', true)
ON CONFLICT (id) DO NOTHING;
