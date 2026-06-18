-- Seed: Kefy self-brand — estrategia y autopilot para que Kefy publique su propio marketing
-- Run AFTER migrations 20260515* through 20260611000002 are applied AND seeds 20260518/20260519 are loaded.
-- Created: 2026-06-17
--
-- Precondiciones (el seed falla con RAISE EXCEPTION si no se cumplen):
--   1. El usuario founder con email 'email@kefy.app' existe en kefy_users.
--   2. Ese usuario es 'owner' de al menos una org en kefy_org_memberships.
--   3. Esa org tiene al menos un brand activo en kefy_brands.
--   4. El brand kit ya está cargado (NO se toca aquí).
--   5. Los seeds de content_strategies (PACK 1 y PACK 2) ya se ejecutaron.
--
-- Lo que crea este seed:
--   - Asigna estrategia "brand_awareness × b2b_saas" en kefy_org_strategies (UPSERT).
--   - Crea hasta 4 reglas en kefy_autopilot_rules (LinkedIn, Facebook, Instagram, TikTok),
--     una por cada cuenta social ya conectada via Zernio. Si una cuenta no existe,
--     la regla correspondiente se omite con RAISE NOTICE (no rompe el seed).
--
-- Mix de formatos (posts, carruseles, reels): se controla con prefijo en topic_hints,
--   p. ej. "[POST] ...", "[CARRUSEL 6 slides] ...", "[REEL 30s] ...".
--   El ejecutor del autopilot debe parsear el prefijo para enrutar al prompt correcto.
--
-- Idempotencia: re-ejecutar este seed no duplica nada. Reglas existentes con el mismo
--   nombre se omiten; la asignación de estrategia se actualiza vía ON CONFLICT.

DO $$
DECLARE
  founder_email     TEXT := 'email@kefy.app';

  founder_user_id   UUID;
  kefy_org_id       UUID;
  kefy_brand_id     UUID;

  obj_awareness_id  UUID;
  ind_b2b_id        UUID;
  strat_id          UUID;

  sa_linkedin_id    UUID;
  sa_facebook_id    UUID;
  sa_instagram_id   UUID;
  sa_tiktok_id      UUID;

  rules_created     INT := 0;
  rules_skipped     INT := 0;

  -- ─── Topic hints por canal ──────────────────────────────────────────────
  -- Cada hint comienza con un prefijo de formato: [POST], [CARRUSEL N slides], [REEL Ns].
  -- El ejecutor del autopilot lee el prefijo para enrutar al prompt correcto
  -- (post.prompt.md / carousel.prompt.md / reel-script.prompt.md).

  -- LinkedIn: 60% posts + 40% carruseles. Foco: thought leadership B2B, founder voice.
  hints_linkedin    TEXT[] := ARRAY[
    '[POST] Por qué los founders LATAM ya no contratan agencias: la nueva economía del marketing self-served',
    '[POST] Hot take: si tu equipo de marketing no usa IA en 2026, estás pagando el doble por la mitad de output',
    '[POST] El error #1 de los founders al delegar redes: contratar antes de definir el sistema',
    '[POST] 3 señales de que tu estrategia de contenido no escala (y qué hacer en lugar de contratar más gente)',
    '[POST] Founder story: cómo construimos Kefy después de gastar miles en agencias que no entregaban',
    '[POST] La diferencia entre "publicar contenido" y "tener un sistema de marketing" — y por qué importa para tu pipeline',
    '[CARRUSEL 6 slides] Anatomía de un calendario editorial que convierte: del hook al lead calificado',
    '[CARRUSEL 6 slides] El stack mínimo de marketing para una startup B2B en LATAM en 2026',
    '[CARRUSEL 7 slides] Caso de uso: cómo una PyME duplicó leads con autopilot de contenido (números reales)',
    '[CARRUSEL 5 slides] 5 KPIs que sí importan en marketing orgánico B2B (y 3 vanity metrics que puedes ignorar)'
  ];

  -- Facebook: 70% posts + 30% carruseles. Foco: comunidad, casos cercanos, tutoriales.
  hints_facebook    TEXT[] := ARRAY[
    '[POST] La verdad incómoda sobre el marketing para PyMEs: no necesitas más herramientas, necesitas un sistema',
    '[POST] ¿Tu negocio publica en redes pero no genera ventas? Esto es lo que falla (y cómo lo arreglamos)',
    '[POST] Historia de cliente: dueño de tienda que pasó de 0 a 50 mensajes/semana sin contratar a nadie',
    '[POST] El minuto que más nos gusta del día en Kefy: leer el inbox unificado de nuestros clientes',
    '[POST] Pregunta abierta: ¿cuánto tiempo a la semana inviertes en pensar tu contenido? Te leo en comentarios',
    '[POST] Recordatorio para founders ocupados: tu marca no se construye con 1 post viral, se construye con consistencia',
    '[POST] Detrás de escenas: así decidimos qué feature lanzar primero en Kefy (spoiler: pregunta a los usuarios)',
    '[CARRUSEL 5 slides] Tutorial: cómo configurar tu primer autopilot de contenido en menos de 10 minutos',
    '[CARRUSEL 6 slides] Plantilla para describir tu marca a una IA y que genere contenido que de verdad suene como tú',
    '[CARRUSEL 4 slides] 4 mitos del marketing en redes que están haciendo perder dinero a las PyMEs LATAM'
  ];

  -- Instagram: 40% reels + 40% carruseles + 20% posts. Foco: educación visual, BTS, demos.
  hints_instagram   TEXT[] := ARRAY[
    '[REEL 30s] Demo rápida: del prompt al post publicado en 4 plataformas en menos de 60 segundos',
    '[REEL 30s] POV: eres founder, son las 11pm y tu calendario de contenido sigue vacío (Kefy lo resuelve mientras duermes)',
    '[REEL 45s] Behind the scenes: cómo Kefy escribe, diseña y agenda un carrusel completo sin que toques nada',
    '[REEL 30s] Tip rápido: el hook que genera 3x más saves en Instagram (y por qué casi nadie lo usa)',
    '[CARRUSEL 8 slides] El framework de contenido B2B que usamos en Kefy: TOFU → MOFU → BOFU explicado con ejemplos reales',
    '[CARRUSEL 8 slides] 8 tipos de post que toda PyME debería tener en su rotación semanal (con copy de ejemplo)',
    '[CARRUSEL 6 slides] Cómo leemos tus mensajes de IG y los convertimos en leads calificados automáticamente',
    '[CARRUSEL 7 slides] Anatomía de un brand kit que la IA entiende: campos críticos que casi todos saltan',
    '[POST] Mensaje directo a quien gestiona las redes de su negocio solo: estás haciendo más de lo que crees',
    '[POST] Cuando tu contenido empieza a sonar a tu marca y no a una plantilla genérica — ese es el momento Kefy'
  ];

  -- TikTok: 100% reels. Foco: tips rápidos, demos producto, founder voice, BTS.
  hints_tiktok      TEXT[] := ARRAY[
    '[REEL 30s] Tip de marketing en 30 segundos: el secreto del primer frame para detener el scroll',
    '[REEL 25s] Founder honesto: "así perdí $3000 en agencias antes de construir mi propio sistema"',
    '[REEL 40s] Demo en vivo: subo una foto de mi producto y Kefy genera 5 piezas de contenido distintas',
    '[REEL 30s] 3 cosas que tu agencia de marketing no te dice (y que cambian el juego)',
    '[REEL 35s] POV: revisas tu DM y ya están todos respondidos con el tono de tu marca',
    '[REEL 30s] El test de 60 segundos para saber si tu marca está lista para escalar contenido con IA',
    '[REEL 45s] Reacción a posts virales: por qué funcionaron (y cómo replicar el patrón sin copiar)',
    '[REEL 30s] Lista rápida: 5 plataformas donde Kefy publica por ti (y cuál te da más leads B2B)',
    '[REEL 40s] Caso real en 40 segundos: cómo un cliente pasó de 200 a 2000 seguidores calificados',
    '[REEL 25s] El error que cometí los primeros 6 meses con Kefy: pensar que la IA no necesita brand kit'
  ];

  topic_tone TEXT := 'profesional, cercano, directo, sin tecnicismos';

  -- Ventana de gracia: 24h después del seed para revisar las reglas antes del primer run.
  next_run_grace TIMESTAMPTZ := NOW() + interval '24 hours';

BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 1 — Resolver founder_user_id
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT id INTO founder_user_id
  FROM kefy_users
  WHERE email = founder_email;

  IF founder_user_id IS NULL THEN
    RAISE EXCEPTION 'Founder user with email % must exist in kefy_users before running this seed', founder_email;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 2 — Resolver kefy_org_id (vía membership owner del founder)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT org_id INTO kefy_org_id
  FROM kefy_org_memberships
  WHERE user_id = founder_user_id AND role = 'owner'
  ORDER BY created_at ASC
  LIMIT 1;

  IF kefy_org_id IS NULL THEN
    RAISE EXCEPTION 'Founder % is not an owner of any organization', founder_email;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 3 — Resolver kefy_brand_id (brand activo más antiguo de la org)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT id INTO kefy_brand_id
  FROM kefy_brands
  WHERE org_id = kefy_org_id AND archived = false
  ORDER BY created_at ASC
  LIMIT 1;

  IF kefy_brand_id IS NULL THEN
    RAISE EXCEPTION 'Organization % has no active brand', kefy_org_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 4 — Resolver objective + industry + strategy
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT id INTO obj_awareness_id FROM kefy_content_objectives WHERE slug = 'brand_awareness';
  SELECT id INTO ind_b2b_id       FROM kefy_content_industries WHERE slug = 'b2b_saas';

  IF obj_awareness_id IS NULL OR ind_b2b_id IS NULL THEN
    RAISE EXCEPTION 'Required objective (brand_awareness) or industry (b2b_saas) missing — run content_strategies seeds first';
  END IF;

  SELECT id INTO strat_id
  FROM kefy_content_strategies
  WHERE objective_id = obj_awareness_id AND industry_id = ind_b2b_id
  LIMIT 1;

  -- Fallback: cualquier estrategia b2b_saas si no existe el match exacto.
  IF strat_id IS NULL THEN
    SELECT id INTO strat_id
    FROM kefy_content_strategies
    WHERE industry_id = ind_b2b_id
    LIMIT 1;
  END IF;

  IF strat_id IS NULL THEN
    RAISE EXCEPTION 'No content strategy found for b2b_saas industry — run content_strategies seeds first';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 5 — Asignar estrategia a la org de Kefy
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO kefy_org_strategies (org_id, objective_id, industry_id, strategy_id, custom_notes)
  VALUES (
    kefy_org_id,
    obj_awareness_id,
    ind_b2b_id,
    strat_id,
    'Kefy self-marketing — Fase 1 de 3 (Brand Awareness). '
    'Plan rotacional: sem 1-4 awareness · sem 5-8 lead generation · sem 9-12 conversion. '
    'Cambiar strategy_id manualmente al avanzar de fase.'
  )
  ON CONFLICT (org_id) DO UPDATE
    SET objective_id = EXCLUDED.objective_id,
        industry_id  = EXCLUDED.industry_id,
        strategy_id  = EXCLUDED.strategy_id,
        custom_notes = EXCLUDED.custom_notes,
        updated_at   = now();

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 6 — Buscar las cuentas sociales ya conectadas via Zernio
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT id INTO sa_linkedin_id
  FROM kefy_social_accounts
  WHERE org_id = kefy_org_id AND platform = 'linkedin' AND status = 'active'
  ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO sa_facebook_id
  FROM kefy_social_accounts
  WHERE org_id = kefy_org_id AND platform = 'facebook' AND status = 'active'
  ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO sa_instagram_id
  FROM kefy_social_accounts
  WHERE org_id = kefy_org_id AND platform = 'instagram' AND status = 'active'
  ORDER BY created_at ASC LIMIT 1;

  SELECT id INTO sa_tiktok_id
  FROM kefy_social_accounts
  WHERE org_id = kefy_org_id AND platform = 'tiktok' AND status = 'active'
  ORDER BY created_at ASC LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 7 — Crear 4 reglas de autopilot (una por canal)
  --   Idempotencia: IF NOT EXISTS por (org_id, name).
  --   Si la cuenta social no existe, la regla se omite con RAISE NOTICE.
  -- ═══════════════════════════════════════════════════════════════════════

  -- ── LinkedIn — Lunes 09:00 CDMX ─────────────────────────────────────────
  IF sa_linkedin_id IS NULL THEN
    RAISE NOTICE 'LinkedIn account not connected for org %, skipping autopilot rule', kefy_org_id;
    rules_skipped := rules_skipped + 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM kefy_autopilot_rules
    WHERE org_id = kefy_org_id AND name = 'Kefy Autopilot — LinkedIn (semanal · thought leadership)'
  ) THEN
    INSERT INTO kefy_autopilot_rules (
      org_id, brand_id, created_by, name, channel, social_account_ids,
      frequency, day_of_week, time_of_day, timezone,
      ai_model, tone, topic_hints, status, next_run_at
    ) VALUES (
      kefy_org_id, kefy_brand_id, founder_user_id,
      'Kefy Autopilot — LinkedIn (semanal · thought leadership)',
      'generic',
      ARRAY[sa_linkedin_id],
      'weekly',
      1,            -- Lunes
      '09:00',
      'America/Mexico_City',
      'claude',
      topic_tone,
      hints_linkedin,
      'active',
      next_run_grace
    );
    rules_created := rules_created + 1;
  END IF;

  -- ── Facebook — Martes 11:00 CDMX ────────────────────────────────────────
  IF sa_facebook_id IS NULL THEN
    RAISE NOTICE 'Facebook account not connected for org %, skipping autopilot rule', kefy_org_id;
    rules_skipped := rules_skipped + 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM kefy_autopilot_rules
    WHERE org_id = kefy_org_id AND name = 'Kefy Autopilot — Facebook (semanal · comunidad)'
  ) THEN
    INSERT INTO kefy_autopilot_rules (
      org_id, brand_id, created_by, name, channel, social_account_ids,
      frequency, day_of_week, time_of_day, timezone,
      ai_model, tone, topic_hints, status, next_run_at
    ) VALUES (
      kefy_org_id, kefy_brand_id, founder_user_id,
      'Kefy Autopilot — Facebook (semanal · comunidad)',
      'generic',
      ARRAY[sa_facebook_id],
      'weekly',
      2,            -- Martes
      '11:00',
      'America/Mexico_City',
      'claude',
      topic_tone,
      hints_facebook,
      'active',
      next_run_grace
    );
    rules_created := rules_created + 1;
  END IF;

  -- ── Instagram — Miércoles 18:00 CDMX ────────────────────────────────────
  IF sa_instagram_id IS NULL THEN
    RAISE NOTICE 'Instagram account not connected for org %, skipping autopilot rule', kefy_org_id;
    rules_skipped := rules_skipped + 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM kefy_autopilot_rules
    WHERE org_id = kefy_org_id AND name = 'Kefy Autopilot — Instagram (semanal · reels y carruseles)'
  ) THEN
    INSERT INTO kefy_autopilot_rules (
      org_id, brand_id, created_by, name, channel, social_account_ids,
      frequency, day_of_week, time_of_day, timezone,
      ai_model, tone, topic_hints, status, next_run_at
    ) VALUES (
      kefy_org_id, kefy_brand_id, founder_user_id,
      'Kefy Autopilot — Instagram (semanal · reels y carruseles)',
      'generic',
      ARRAY[sa_instagram_id],
      'weekly',
      3,            -- Miércoles
      '18:00',
      'America/Mexico_City',
      'claude',
      topic_tone,
      hints_instagram,
      'active',
      next_run_grace
    );
    rules_created := rules_created + 1;
  END IF;

  -- ── TikTok — Viernes 20:00 CDMX ─────────────────────────────────────────
  IF sa_tiktok_id IS NULL THEN
    RAISE NOTICE 'TikTok account not connected for org %, skipping autopilot rule', kefy_org_id;
    rules_skipped := rules_skipped + 1;
  ELSIF NOT EXISTS (
    SELECT 1 FROM kefy_autopilot_rules
    WHERE org_id = kefy_org_id AND name = 'Kefy Autopilot — TikTok (semanal · reels)'
  ) THEN
    INSERT INTO kefy_autopilot_rules (
      org_id, brand_id, created_by, name, channel, social_account_ids,
      frequency, day_of_week, time_of_day, timezone,
      ai_model, tone, topic_hints, status, next_run_at
    ) VALUES (
      kefy_org_id, kefy_brand_id, founder_user_id,
      'Kefy Autopilot — TikTok (semanal · reels)',
      'generic',
      ARRAY[sa_tiktok_id],
      'weekly',
      5,            -- Viernes
      '20:00',
      'America/Mexico_City',
      'claude',
      topic_tone,
      hints_tiktok,
      'active',
      next_run_grace
    );
    rules_created := rules_created + 1;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- STEP 8 — Reporte final
  -- ═══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'Kefy self-seed completado:';
  RAISE NOTICE '  org_id        = %', kefy_org_id;
  RAISE NOTICE '  brand_id      = %', kefy_brand_id;
  RAISE NOTICE '  founder       = % (%)', founder_email, founder_user_id;
  RAISE NOTICE '  strategy_id   = % (brand_awareness x b2b_saas)', strat_id;
  RAISE NOTICE '  reglas creadas = %', rules_created;
  RAISE NOTICE '  reglas omitidas = %', rules_skipped;
  RAISE NOTICE '';
  RAISE NOTICE 'Reglas activas con next_run_at = NOW() + 24h (ventana de gracia).';
  RAISE NOTICE 'Para revisar: SELECT name, status, next_run_at FROM kefy_autopilot_rules WHERE org_id = ''%'';', kefy_org_id;
  RAISE NOTICE '────────────────────────────────────────────────────────';

END $$;

-- ─── Verificación post-seed ──────────────────────────────────────────────────
-- Ejecutar manualmente después del seed para validar:
--
-- 1) Estrategia asignada:
--    SELECT s.framework_slug, s.framework_name_es
--    FROM kefy_org_strategies os
--    JOIN kefy_content_strategies s ON s.id = os.strategy_id
--    JOIN kefy_users u ON u.email = 'email@kefy.app'
--    JOIN kefy_org_memberships m ON m.user_id = u.id AND m.role = 'owner' AND m.org_id = os.org_id;
--
-- 2) Reglas autopilot creadas:
--    SELECT name, channel, frequency, day_of_week, time_of_day, status, next_run_at,
--           array_length(topic_hints, 1) AS num_hints
--    FROM kefy_autopilot_rules
--    WHERE org_id = (SELECT org_id FROM kefy_org_memberships m
--                    JOIN kefy_users u ON u.id = m.user_id
--                    WHERE u.email = 'email@kefy.app' AND m.role = 'owner' LIMIT 1)
--    ORDER BY day_of_week;
--
-- 3) Cuentas sociales conectadas:
--    SELECT platform, username, status FROM kefy_social_accounts
--    WHERE org_id = (SELECT org_id FROM kefy_org_memberships m
--                    JOIN kefy_users u ON u.id = m.user_id
--                    WHERE u.email = 'email@kefy.app' AND m.role = 'owner' LIMIT 1);
