-- Migration: asistente de IA (conversaciones, turnos, mensajes, acciones) y API keys
--
-- El asistente del dashboard, el servidor MCP (/api/mcp) y la API REST
-- (/api/v1) comparten un único registro de acciones (lib/assistant/registry.ts).
--
--   * kefy_api_keys: claves de organización para MCP y /api/v1. Solo se guarda
--     el hash sha256 (igual que invitaciones y refresh tokens); el valor en
--     claro se muestra una única vez. La clave actúa con el rol ACTUAL de quien
--     la creó (se resuelve en cada petición).
--   * kefy_assistant_conversations: una por hilo de chat. tainted_through_seq
--     marca el último mensaje que trajo contenido no confiable (DMs,
--     comentarios, contenido externo): mientras siga en la ventana de historial,
--     toda acción que escriba pide confirmación.
--   * kefy_assistant_turns: un turno = un mensaje del usuario = 1 mensaje de la
--     cuota mensual del asistente (no gasta créditos de IA). Acota cuántas
--     llamadas al modelo caben en ese mensaje, también a través de
--     confirmaciones (kefy_assistant_turn_step).
--   * kefy_usage_counters.assistant_messages: cuota mensual de mensajes al
--     asistente, aparte de los créditos (kefy_assistant_consume / _refund).
--   * kefy_assistant_messages: bloques de Anthropic tal cual (text, thinking,
--     tool_use, tool_result) para reenviar el historial exacto.
--   * kefy_assistant_actions: confirmaciones pendientes y auditoría de toda
--     acción con efectos (chat, MCP o API). Borrar una conversación NO borra la
--     auditoría (SET NULL).
-- Created: 2026-09-22

-- ─── API keys ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_api_keys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  -- Si se fija, la clave solo actúa sobre esta marca y no puede tocar datos de
  -- toda la organización (estrategia, nombre de la org).
  brand_id      UUID        REFERENCES kefy_brands(id) ON DELETE CASCADE,
  created_by    UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  key_prefix    TEXT        NOT NULL,
  key_hash      TEXT        NOT NULL UNIQUE,
  scopes        TEXT[]      NOT NULL DEFAULT ARRAY['read']::TEXT[]
                            CHECK (cardinality(scopes) > 0
                                   AND scopes <@ ARRAY['read','write','publish']::TEXT[]),
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_api_keys_org_idx
  ON kefy_api_keys (org_id, created_at DESC);

-- ─── Conversaciones ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_assistant_conversations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  brand_id             UUID        REFERENCES kefy_brands(id) ON DELETE SET NULL,
  user_id              UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  title                TEXT        CHECK (title IS NULL OR char_length(title) <= 200),
  tainted_through_seq  BIGINT,
  last_message_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_assistant_conversations_user_idx
  ON kefy_assistant_conversations (org_id, user_id, last_message_at DESC)
  WHERE archived_at IS NULL;

-- ─── Turnos (1 mensaje del usuario = 1 mensaje de la cuota) ─────────────────

CREATE TABLE IF NOT EXISTS kefy_assistant_turns (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID        NOT NULL REFERENCES kefy_assistant_conversations(id) ON DELETE CASCADE,
  org_id             UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  model_calls        INTEGER     NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  max_model_calls    INTEGER     NOT NULL CHECK (max_model_calls > 0),
  credits_charged    INTEGER     NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  input_tokens       BIGINT      NOT NULL DEFAULT 0,
  output_tokens      BIGINT      NOT NULL DEFAULT 0,
  cache_read_tokens  BIGINT      NOT NULL DEFAULT 0,
  status             TEXT        NOT NULL DEFAULT 'running'
                                 CHECK (status IN ('running', 'awaiting_confirmation',
                                                   'completed', 'failed', 'aborted')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (model_calls <= max_model_calls)
);

CREATE INDEX IF NOT EXISTS kefy_assistant_turns_conv_idx
  ON kefy_assistant_turns (conversation_id, created_at DESC);

-- Reserva atómicamente una llamada al modelo dentro del turno. Devuelve el
-- número de llamadas tras reservar, o -1 si el turno ya agotó su tope (o no
-- pertenece a la organización).
CREATE OR REPLACE FUNCTION kefy_assistant_turn_step(p_turn_id UUID, p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_calls INTEGER;
BEGIN
  UPDATE kefy_assistant_turns
     SET model_calls = model_calls + 1,
         updated_at  = now()
   WHERE id = p_turn_id
     AND org_id = p_org_id
     AND model_calls < max_model_calls
  RETURNING model_calls INTO v_calls;

  RETURN COALESCE(v_calls, -1);
END;
$$;

-- ─── Mensajes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_assistant_messages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID        NOT NULL REFERENCES kefy_assistant_conversations(id) ON DELETE CASCADE,
  org_id             UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES kefy_users(id) ON DELETE CASCADE,
  turn_id            UUID        REFERENCES kefy_assistant_turns(id) ON DELETE SET NULL,
  -- Orden estricto dentro de la conversación (created_at puede empatar).
  seq                BIGINT      GENERATED ALWAYS AS IDENTITY,
  role               TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  -- Bloques de Anthropic tal cual (text / thinking / tool_use / tool_result / ...).
  content            JSONB       NOT NULL,
  -- Texto visible para la UI y los títulos; NULL si solo hay tool_result.
  text               TEXT,
  model              TEXT,
  stop_reason        TEXT,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cache_read_tokens  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_assistant_messages_conv_idx
  ON kefy_assistant_messages (conversation_id, seq);

-- ─── Acciones (confirmación + auditoría) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS kefy_assistant_actions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL REFERENCES kefy_organizations(id) ON DELETE CASCADE,
  brand_id           UUID        REFERENCES kefy_brands(id) ON DELETE SET NULL,
  user_id            UUID        REFERENCES kefy_users(id) ON DELETE SET NULL,
  api_key_id         UUID        REFERENCES kefy_api_keys(id) ON DELETE SET NULL,
  conversation_id    UUID        REFERENCES kefy_assistant_conversations(id) ON DELETE SET NULL,
  turn_id            UUID        REFERENCES kefy_assistant_turns(id) ON DELETE SET NULL,
  -- Mensaje del asistente que contiene el tool_use (solo chat).
  message_id         UUID        REFERENCES kefy_assistant_messages(id) ON DELETE SET NULL,
  tool_use_id        TEXT,
  tool_name          TEXT        NOT NULL,
  source             TEXT        NOT NULL CHECK (source IN ('chat', 'mcp', 'api')),
  kind               TEXT        NOT NULL CHECK (kind IN ('read', 'write', 'publish')),
  input              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT        NOT NULL
                                 CHECK (status IN ('pending_confirmation', 'rejected', 'expired',
                                                   'running', 'succeeded', 'failed')),
  -- Resultado para el llamador (truncado a 64KB) y bloque tool_result ya
  -- preparado para reanudar el turno del chat.
  result             JSONB,
  tool_result        JSONB,
  error              TEXT,
  credits_estimated  INTEGER     NOT NULL DEFAULT 0 CHECK (credits_estimated >= 0),
  -- Idempotencia de la API/MCP: única por clave de API; el hash detecta la
  -- reutilización de una clave con otro payload.
  idempotency_key    TEXT        CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 200),
  idempotency_hash   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  CONSTRAINT kefy_assistant_actions_pending_expiry
    CHECK (status <> 'pending_confirmation' OR expires_at IS NOT NULL),
  -- Los NULL no chocan entre sí: solo las filas con clave participan.
  CONSTRAINT kefy_assistant_actions_idem_key UNIQUE (api_key_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS kefy_assistant_actions_org_idx
  ON kefy_assistant_actions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kefy_assistant_actions_message_idx
  ON kefy_assistant_actions (message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_assistant_actions_conv_idx
  ON kefy_assistant_actions (conversation_id, created_at)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kefy_assistant_actions_pending_idx
  ON kefy_assistant_actions (org_id, user_id, expires_at)
  WHERE status = 'pending_confirmation';

-- ─── Cuota mensual de mensajes al asistente ─────────────────────────────────
--
-- Chatear con el asistente no gasta créditos de IA: cada plan trae un tope de
-- mensajes al mes (lib/usage.ts, PLAN_ASSISTANT_MESSAGES). Lo que el asistente
-- genera (posts, imágenes, carruseles) sí cobra créditos, como en la UI.
-- Comparte la fila (org_id, period) de kefy_usage_counters con los créditos.

ALTER TABLE kefy_usage_counters
  ADD COLUMN IF NOT EXISTS assistant_messages INTEGER NOT NULL DEFAULT 0;

-- Consume un mensaje de forma atómica. Devuelve el total consumido tras la
-- operación, o -1 si no cabía en el tope. Mismo patrón que kefy_credits_consume:
-- el chequeo y el incremento van en la misma sentencia.
CREATE OR REPLACE FUNCTION kefy_assistant_consume(
  p_org_id  UUID,
  p_period  TEXT,
  p_limit   INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_used INTEGER;
BEGIN
  IF p_limit <= 0 THEN
    RETURN -1;
  END IF;

  INSERT INTO kefy_usage_counters (org_id, period, credits, assistant_messages, updated_at)
  VALUES (p_org_id, p_period, 0, 1, now())
  ON CONFLICT (org_id, period)
  DO UPDATE SET assistant_messages = kefy_usage_counters.assistant_messages + 1,
                updated_at = now()
  WHERE kefy_usage_counters.assistant_messages + 1 <= p_limit
  RETURNING assistant_messages INTO v_used;

  -- Sin fila devuelta: el WHERE del DO UPDATE bloqueó el incremento.
  IF v_used IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_used;
END;
$$;

-- Devuelve un mensaje a la cuota (el turno falló antes de llegar al modelo).
CREATE OR REPLACE FUNCTION kefy_assistant_refund(
  p_org_id  UUID,
  p_period  TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE kefy_usage_counters
     SET assistant_messages = GREATEST(assistant_messages - 1, 0), updated_at = now()
   WHERE org_id = p_org_id AND period = p_period;
END;
$$;
