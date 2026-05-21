-- Automation packs: pre-built engagement rule sets tied to content objectives
-- One pack = multiple rule templates that get applied to an org with one click

CREATE TABLE IF NOT EXISTS kefy_automation_packs (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID  NOT NULL REFERENCES kefy_content_objectives(id) ON DELETE CASCADE,
  name_es      TEXT  NOT NULL,
  name_en      TEXT  NOT NULL,
  desc_es      TEXT,
  desc_en      TEXT,
  icon         TEXT,
  sort_order   INT   NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_automation_packs_obj_idx ON kefy_automation_packs(objective_id);

-- Each pack contains N rule blueprints
CREATE TABLE IF NOT EXISTS kefy_automation_pack_rules (
  id                      UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id                 UUID  NOT NULL REFERENCES kefy_automation_packs(id) ON DELETE CASCADE,
  name_es                 TEXT  NOT NULL,
  name_en                 TEXT  NOT NULL,
  desc_es                 TEXT,
  desc_en                 TEXT,
  trigger_type            TEXT  NOT NULL,
  trigger_config          JSONB NOT NULL DEFAULT '{}',
  action_type             TEXT  NOT NULL,
  action_config           JSONB NOT NULL DEFAULT '{}',
  ai_context              TEXT,
  delay_minutes           INT   NOT NULL DEFAULT 0,
  lead_action_type        TEXT  CHECK (lead_action_type IN ('create_lead', 'update_lead')),
  lead_action_score_delta INT   DEFAULT 0,
  lead_action_stage       TEXT,
  sort_order              INT   NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kefy_automation_pack_rules_pack_idx ON kefy_automation_pack_rules(pack_id);

-- ── Seed: 4 packs (one per objective) ────────────────────────────────────────
DO $$
DECLARE
  obj_leads      UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'lead_generation');
  obj_awareness  UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'brand_awareness');
  obj_nurturing  UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'nurturing');
  obj_conversion UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'conversion');

  pack_leads      UUID;
  pack_awareness  UUID;
  pack_nurturing  UUID;
  pack_conversion UUID;
BEGIN

  -- ── Pack: Captación de Leads (lead_generation) ─────────────────────────────
  INSERT INTO kefy_automation_packs (objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order)
  VALUES (obj_leads,
    'Captación de Leads', 'Lead Capture',
    'Detecta interacciones de alta intención y crea leads automáticamente con score inicial.',
    'Detects high-intent interactions and automatically creates leads with an initial score.',
    '🎯', 1)
  ON CONFLICT DO NOTHING
  RETURNING id INTO pack_leads;

  IF pack_leads IS NOT NULL THEN
    INSERT INTO kefy_automation_pack_rules
      (pack_id, name_es, name_en, desc_es, desc_en, trigger_type, trigger_config, action_type, action_config, ai_context, delay_minutes, lead_action_type, lead_action_score_delta, lead_action_stage, sort_order)
    VALUES
      (pack_leads,
       'Keyword de interés detectada', 'Interest keyword detected',
       'Cuando alguien comenta una palabra clave de interés, crea un lead frío y responde.',
       'When someone comments an interest keyword, create a cold lead and reply.',
       'comment_contains_keyword', '{"keywords": ["precio", "info", "cuánto", "quiero"]}',
       'reply_comment_ai', '{}',
       'El usuario mostró interés con una keyword. Responde con información útil y un CTA suave para continuar la conversación por DM.',
       0, 'create_lead', 10, 'frio', 1),

      (pack_leads,
       'DM entrante sin respuesta', 'Unanswered incoming DM',
       'Si un DM no es respondido en 60 minutos, notifica al equipo.',
       'If a DM is not answered within 60 minutes, notify the team.',
       'dm_no_response', '{"timeout_minutes": 60}',
       'notify_team', '{"message": "Hay un DM sin responder"}',
       NULL, 0, 'update_lead', 5, 'tibio', 2),

      (pack_leads,
       'Nuevo DM directo', 'New direct message',
       'Cuando alguien envía un DM, crea o actualiza su lead y responde con IA.',
       'When someone sends a DM, create or update their lead and reply with AI.',
       'new_dm', '{}',
       'send_dm_ai_response', '{}',
       'El usuario inició una conversación por DM. Responde de forma amigable, recoge su necesidad y ofrece ayuda.',
       2, 'create_lead', 15, 'tibio', 3);
  END IF;

  -- ── Pack: Comunidad & Alcance (brand_awareness) ────────────────────────────
  INSERT INTO kefy_automation_packs (objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order)
  VALUES (obj_awareness,
    'Comunidad & Alcance', 'Community & Reach',
    'Aumenta la interacción orgánica respondiendo automáticamente a comentarios y menciones.',
    'Boost organic interaction by automatically replying to comments and mentions.',
    '📢', 2)
  ON CONFLICT DO NOTHING
  RETURNING id INTO pack_awareness;

  IF pack_awareness IS NOT NULL THEN
    INSERT INTO kefy_automation_pack_rules
      (pack_id, name_es, name_en, desc_es, desc_en, trigger_type, trigger_config, action_type, action_config, ai_context, delay_minutes, lead_action_type, lead_action_score_delta, lead_action_stage, sort_order)
    VALUES
      (pack_awareness,
       'Dar la bienvenida a nuevos seguidores', 'Welcome new followers',
       'Envía un DM de bienvenida personalizado a cada nuevo seguidor.',
       'Send a personalized welcome DM to every new follower.',
       'new_follower', '{}',
       'send_dm_ai_response', '{}',
       'Nuevo seguidor acaba de seguir la cuenta. Dale la bienvenida de forma cálida, preséntate brevemente y pregunta en qué puedes ayudarle.',
       5, 'create_lead', 5, 'frio', 1),

      (pack_awareness,
       'Responder todos los comentarios', 'Reply to all comments',
       'Responde con IA a cada nuevo comentario para maximizar el alcance.',
       'Reply with AI to every new comment to maximize reach.',
       'new_comment', '{}',
       'reply_comment_ai', '{}',
       'Alguien comentó en una publicación. Responde de forma auténtica, positiva y con personalidad de marca. Fomenta la conversación.',
       3, NULL, 0, NULL, 2),

      (pack_awareness,
       'Reaccionar a menciones de marca', 'React to brand mentions',
       'Cuando alguien menciona tu marca, dale like y responde.',
       'When someone mentions your brand, like and reply.',
       'brand_mention', '{}',
       'reply_comment_ai', '{}',
       'Alguien mencionó la marca. Agradece, suma al contexto de su mención y proyecta una imagen cercana.',
       1, NULL, 3, NULL, 3);
  END IF;

  -- ── Pack: Fidelización (nurturing) ─────────────────────────────────────────
  INSERT INTO kefy_automation_packs (objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order)
  VALUES (obj_nurturing,
    'Fidelización de Clientes', 'Customer Loyalty',
    'Convierte seguidores en fans leales respondiendo reseñas y creando conversaciones de valor.',
    'Turn followers into loyal fans by replying to reviews and creating valuable conversations.',
    '🤝', 3)
  ON CONFLICT DO NOTHING
  RETURNING id INTO pack_nurturing;

  IF pack_nurturing IS NOT NULL THEN
    INSERT INTO kefy_automation_pack_rules
      (pack_id, name_es, name_en, desc_es, desc_en, trigger_type, trigger_config, action_type, action_config, ai_context, delay_minutes, lead_action_type, lead_action_score_delta, lead_action_stage, sort_order)
    VALUES
      (pack_nurturing,
       'Responder reseñas positivas', 'Reply to positive reviews',
       'Responde automáticamente a reseñas de 4 o 5 estrellas con un mensaje personalizado.',
       'Automatically reply to 4 or 5-star reviews with a personalized message.',
       'new_review', '{"min_rating": 4}',
       'reply_review_ai', '{}',
       'Cliente dejó una reseña muy positiva. Agradece con entusiasmo, destaca algo específico de su feedback y anímale a volver.',
       10, 'update_lead', 20, 'caliente', 1),

      (pack_nurturing,
       'Gestionar reseñas negativas', 'Handle negative reviews',
       'Notifica al equipo ante reseñas de 1-2 estrellas para respuesta humana urgente.',
       'Notify the team on 1-2 star reviews for urgent human response.',
       'new_review', '{"max_rating": 2}',
       'notify_team', '{"priority": "high", "message": "Reseña negativa que requiere atención"}',
       NULL, 0, 'update_lead', -10, 'tibio', 2),

      (pack_nurturing,
       'Post compartido: contactar al usuario', 'Post shared: reach out',
       'Cuando alguien comparte un post, envía un DM de agradecimiento.',
       'When someone shares a post, send a thank-you DM.',
       'post_shared', '{}',
       'send_dm_ai_response', '{}',
       'El usuario compartió un post de la marca. Agradecer de forma genuina y ofrecerle contenido exclusivo o un descuento.',
       15, 'update_lead', 10, NULL, 3);
  END IF;

  -- ── Pack: Conversión Directa (conversion) ─────────────────────────────────
  INSERT INTO kefy_automation_packs (objective_id, name_es, name_en, desc_es, desc_en, icon, sort_order)
  VALUES (obj_conversion,
    'Conversión Directa', 'Direct Conversion',
    'Detecta señales de compra y actúa de inmediato con respuestas y seguimiento automatizado.',
    'Detect buying signals and act immediately with automated replies and follow-ups.',
    '💰', 4)
  ON CONFLICT DO NOTHING
  RETURNING id INTO pack_conversion;

  IF pack_conversion IS NOT NULL THEN
    INSERT INTO kefy_automation_pack_rules
      (pack_id, name_es, name_en, desc_es, desc_en, trigger_type, trigger_config, action_type, action_config, ai_context, delay_minutes, lead_action_type, lead_action_score_delta, lead_action_stage, sort_order)
    VALUES
      (pack_conversion,
       'Keyword de compra detectada', 'Purchase keyword detected',
       'Cuando alguien menciona "comprar", "precio" u otras señales, responde con CTA directo.',
       'When someone mentions "buy", "price" or other signals, reply with a direct CTA.',
       'comment_contains_keyword', '{"keywords": ["comprar", "precio", "costo", "quiero uno", "dónde compro"]}',
       'reply_comment_ai', '{}',
       'El usuario mostró una señal de compra clara. Responde con información directa sobre el producto, precio y cómo adquirirlo. Incluye un link si es posible.',
       0, 'create_lead', 25, 'caliente', 1),

      (pack_conversion,
       'DM con keyword de compra', 'DM with purchase keyword',
       'DM entrante que menciona intención de compra: responde de inmediato con IA.',
       'Incoming DM mentioning purchase intent: reply immediately with AI.',
       'dm_contains_keyword', '{"keywords": ["comprar", "precio", "cotización", "quiero"]}',
       'send_dm_ai_response', '{}',
       'El usuario escribió un DM con intención de compra. Proporciona toda la información necesaria, resuelve dudas y cierra con un CTA claro para cerrar la venta.',
       0, 'create_lead', 30, 'caliente', 2),

      (pack_conversion,
       'Lead caliente sin respuesta', 'Hot lead unanswered',
       'Si un lead caliente no ha recibido respuesta en 30 min, alerta urgente al equipo.',
       'If a hot lead has no reply within 30 min, urgent alert to the team.',
       'dm_no_response', '{"timeout_minutes": 30, "min_lead_stage": "caliente"}',
       'notify_team', '{"priority": "urgent", "message": "Lead caliente sin respuesta"}',
       NULL, 0, NULL, 0, NULL, 3);
  END IF;

END $$;
