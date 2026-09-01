-- Migration: create kefy_rate_limits and kefy_usage_counters
-- Soporte para la beta abierta: frenar abuso (rate limiting por ventana) y
-- acotar el gasto en IA (créditos mensuales por organización y plan).
-- Created: 2026-09-01

-- ─── Rate limiting ────────────────────────────────────────────────────────────
-- Una fila por (bucket, ventana). `bucket` identifica al sujeto limitado:
--   'login:ip:1.2.3.4', 'register:ip:1.2.3.4', 'ai:org:<uuid>'
-- `window_start` es el inicio truncado de la ventana, así cada ventana es una
-- fila distinta y el conteo se reinicia solo.

CREATE TABLE IF NOT EXISTS kefy_rate_limits (
  bucket        TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON kefy_rate_limits(window_start);

-- Incremento atómico. Devuelve el conteo resultante dentro de la ventana.
-- Se hace en el servidor de base de datos porque las funciones serverless no
-- comparten memoria: un contador en proceso no limitaría nada entre lambdas.
CREATE OR REPLACE FUNCTION kefy_rate_limit_hit(
  p_bucket        TEXT,
  p_window_start  TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO kefy_rate_limits (bucket, window_start, count, updated_at)
  VALUES (p_bucket, p_window_start, 1, now())
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = kefy_rate_limits.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Limpieza de ventanas viejas. La llama el cron de autopilot.
CREATE OR REPLACE FUNCTION kefy_rate_limit_gc(p_older_than TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM kefy_rate_limits WHERE window_start < p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ─── Créditos de IA ───────────────────────────────────────────────────────────
-- Un único pool mensual por organización, que es exactamente lo que vende la
-- página de precios («150 créditos IA / mes»).
--
-- Cada operación descuenta según lo que cuesta de verdad, no una por una: un
-- render de reel vale mucho más que un caption. Los pesos viven en
-- lib/usage.ts (CREDIT_COSTS) para poder ajustarlos sin migrar.
--
-- `period` es 'YYYY-MM' en UTC.

CREATE TABLE IF NOT EXISTS kefy_usage_counters (
  org_id      UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  period      TEXT        NOT NULL,
  credits     INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_period ON kefy_usage_counters(period);

-- Consume créditos de forma atómica.
-- Devuelve el total consumido tras la operación, o -1 si no cabía en el tope.
-- El chequeo y el incremento van en la misma sentencia para que dos peticiones
-- simultáneas al borde del límite no puedan pasar ambas.
CREATE OR REPLACE FUNCTION kefy_credits_consume(
  p_org_id  UUID,
  p_period  TEXT,
  p_amount  INTEGER,
  p_limit   INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  -- Una operación que por sí sola no cabe en el plan nunca podrá ejecutarse:
  -- se corta aquí en vez de dejar que el INSERT deje el contador por encima.
  IF p_amount <= 0 OR p_amount > p_limit THEN
    RETURN -1;
  END IF;

  INSERT INTO kefy_usage_counters (org_id, period, credits, updated_at)
  VALUES (p_org_id, p_period, p_amount, now())
  ON CONFLICT (org_id, period)
  DO UPDATE SET credits = kefy_usage_counters.credits + p_amount, updated_at = now()
  WHERE kefy_usage_counters.credits + p_amount <= p_limit
  RETURNING credits INTO v_credits;

  -- Sin fila devuelta: el WHERE del DO UPDATE bloqueó el incremento.
  IF v_credits IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_credits;
END;
$$;

-- Devuelve créditos al pool (se llama cuando la operación falla después de
-- haberlos consumido; no se le cobra al usuario un fallo nuestro).
CREATE OR REPLACE FUNCTION kefy_credits_refund(
  p_org_id  UUID,
  p_period  TEXT,
  p_amount  INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE kefy_usage_counters
     SET credits = GREATEST(credits - p_amount, 0), updated_at = now()
   WHERE org_id = p_org_id AND period = p_period;
END;
$$;
