-- Seed: content strategies — objectives, industries, strategies and templates
-- Run AFTER migration 20260518000001_create_content_strategies.sql
-- Modular design: add more packs via additional INSERT files without touching this one
-- Created: 2026-05-18

-- ─────────────────────────────────────────────────────────────────────────────
-- PACK 1 — Core objectives (4)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO kefy_content_objectives (slug, name_es, name_en, desc_es, desc_en, icon, sort_order) VALUES
('lead_generation', 'Generación de Leads', 'Lead Generation',
 'Contenido que genera fricción controlada: da valor suficiente para crear confianza, pero deja un gap que solo se cierra con tu producto o servicio.',
 'Content that creates controlled friction: gives enough value to build trust, but leaves a gap that only closes with your product or service.',
 '🎯', 1),
('brand_awareness', 'Brand Awareness', 'Brand Awareness',
 'Contenido que maximiza el alcance orgánico y posiciona un punto de vista claro (POV). Frecuencia sobre perfección.',
 'Content that maximizes organic reach and positions a clear point of view (POV). Frequency over perfection.',
 '📢', 2),
('nurturing', 'Nurturing / Retención', 'Nurturing / Retention',
 'Para quienes ya tienen audiencia y necesitan convertirla. Contenido educativo de alto valor + humanización + comunidad.',
 'For those who already have an audience and need to convert it. High-value educational content + humanization + community.',
 '🌱', 3),
('conversion', 'Conversión / Ventas', 'Conversion / Sales',
 'Contenido orientado a cierre directo. Fricción reducida, CTA claro, urgencia real y social proof en cada pieza.',
 'Content oriented toward direct close. Reduced friction, clear CTA, real urgency and social proof in every piece.',
 '💰', 4)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- PACK 1 — Core industries (7)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO kefy_content_industries (slug, name_es, name_en, icon, desc_es, sort_order) VALUES
('inmobiliario',  'Inmobiliarias / Arriendos',     'Real Estate',                '🏠', 'Gestión de propiedades, arriendos, ventas y administración inmobiliaria.',       1),
('eventos',       'Eventos y Ticketeras',           'Events & Ticketing',          '🎪', 'Organización de eventos, venta de entradas, conseguir sponsors y oradores.',      2),
('b2b_saas',      'B2B / Consultoría / SaaS',       'B2B / Consulting / SaaS',     '💼', 'Empresas que venden a otras empresas: software, servicios profesionales, consultoría.', 3),
('ecommerce',     'eCommerce / Retail',             'eCommerce / Retail',          '🛒', 'Tiendas online y retail con foco en conversión directa y remarketing.',           4),
('educacion',     'Educación / Cursos / Coaches',   'Education / Courses / Coaches','🎓', 'Infoproductores, coaches, consultores y plataformas educativas.',                 5),
('gastronomia',   'Gastronomía / Restaurantes',     'Food & Restaurants',          '🍽️', 'Restaurantes, cafés, delivery, catering y emprendimientos gastronómicos.',         6),
('salud',         'Salud / Wellness / Fitness',     'Health / Wellness / Fitness', '🏋️', 'Clínicas, coaches de salud, gimnasios, nutricionistas y bienestar personal.',      7)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- PACK 1 — Core strategies (7 — one per industry, most common objective)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: get IDs as variables using DO block with temp table
DO $$
DECLARE
  obj_leads       UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'lead_generation');
  obj_awareness   UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'brand_awareness');
  obj_nurturing   UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'nurturing');
  obj_conversion  UUID := (SELECT id FROM kefy_content_objectives WHERE slug = 'conversion');

  ind_inmob   UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'inmobiliario');
  ind_eventos UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'eventos');
  ind_b2b     UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'b2b_saas');
  ind_ecomm   UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'ecommerce');
  ind_edu     UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'educacion');
  ind_gastro  UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'gastronomia');
  ind_salud   UUID := (SELECT id FROM kefy_content_industries WHERE slug = 'salud');

  s_inmob   UUID;
  s_eventos UUID;
  s_b2b     UUID;
  s_ecomm   UUID;
  s_edu     UUID;
  s_gastro  UUID;
  s_salud   UUID;

  layers_3cap JSONB := '[
    {
      "num_es": "CAPA 1", "num_en": "LAYER 1",
      "title_es": "Publicación", "title_en": "Publishing",
      "items_es": ["Hook potente en las primeras líneas", "Cuerpo con valor real (educativo, emocional o de prueba)", "CTA claro y único al final"],
      "items_en": ["Strong hook in the first lines", "Body with real value (educational, emotional or proof)", "Clear and singular CTA at the end"]
    },
    {
      "num_es": "CAPA 2", "num_en": "LAYER 2",
      "title_es": "Interacción activa (primeras 2 horas)", "title_en": "Active engagement (first 2 hours)",
      "items_es": ["Responder todos los comentarios con preguntas abiertas", "DM a perfiles que interactúan y calzan con tu cliente ideal", "Comentar en publicaciones relacionadas del nicho"],
      "items_en": ["Reply to every comment with open-ended questions", "DM profiles that engage and match your ideal customer", "Comment on related posts in the niche"]
    },
    {
      "num_es": "CAPA 3", "num_en": "LAYER 3",
      "title_es": "Seguimiento (día 3)", "title_en": "Follow-up (day 3)",
      "items_es": ["Repost del contenido con nuevo ángulo o dato extra", "Story recordando el punto clave del post", "DM de seguimiento a leads tibios con contenido nuevo"],
      "items_en": ["Repost the content with a new angle or extra data point", "Story reminding followers of the key takeaway", "Follow-up DM to warm leads with fresh content"]
    }
  ]';

BEGIN
  -- ── 1. Inmobiliario → Lead Generation (PPPP) ──────────────────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_leads, ind_inmob, 'pppp',
     'PPPP — Problem → Promise → Proof → Proposal',
     'PPPP — Problem → Promise → Proof → Proposal',
     'Nombra el dolor del mercado con especificidad → Muestra que existe una solución → Prueba social con caso real y número concreto → CTA directo hacia lead magnet, demo o formulario.',
     'Name the market pain with brutal specificity → Show that a solution exists → Social proof with real case and concrete number → Direct CTA toward lead magnet, demo or form.',
     'Formularios / DMs recibidos', 'CTR en CTA',
     'Forms / DMs received', 'CTA CTR',
     layers_3cap,
     'Formulario corto (3 preguntas) + WhatsApp automático con respuesta en menos de 5 minutos. Calificar en comentarios: "¿tienes 1 propiedad o más?"',
     'Short form (3 questions) + automated WhatsApp reply within 5 minutes. Qualify in comments: "Do you have 1 property or more?"')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_inmob;

  IF s_inmob IS NULL THEN
    SELECT id INTO s_inmob FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_inmob;
  END IF;

  -- Inmobiliario templates (4 semanas)
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_inmob, 1, 1, 'carrusel', 'instagram',
     '5 errores que cometen los propietarios al arrendar sin administración profesional',
     'Slide 1: gancho con el error más costoso. Slides 2-5: un error por slide con dato real o consecuencia concreta. Slide final: CTA suave ("¿Cometes alguno de estos?")',
     'Awareness + dolor', '5 mistakes landlords make without professional property management',
     'Slide 1: hook with the most costly mistake. Slides 2-5: one mistake per slide with real data or concrete consequence. Final slide: soft CTA.',
     'Awareness + pain', 10),
    (s_inmob, 2, 1, 'reel', 'instagram',
     'Caso real: "Este propietario perdió $X por no tener administración"',
     'Historia en formato problema-solución-resultado. Cifra concreta al inicio como gancho. Sin revelar nombres. Terminar con pregunta directa.',
     'Prueba social', '"This landlord lost $X without property management" — real case study',
     'Problem-solution-result story format. Concrete number as hook at start. No names. End with direct question.',
     'Social proof', 20),
    (s_inmob, 3, 1, 'infografía', 'general',
     'Comparativa: "Arrendar solo vs. con gestión profesional — ¿qué sale más caro?"',
     'Tabla o comparación visual con al menos 5 dimensiones: tiempo, ingreso neto, problemas legales, morosidad, desgaste emocional.',
     'Consideración', '"Managing alone vs. with professional management — which costs more?" comparison',
     'Visual table with at least 5 dimensions: time, net income, legal issues, late payments, emotional stress.',
     'Consideration', 30),
    (s_inmob, 4, 1, 'story', 'instagram',
     'CTA directo: "Cotiza gratis la gestión de tu propiedad en 48 horas"',
     'Story con swipe-up o link en bio. Urgencia real (cupos limitados o fecha límite). Número de propiedades gestionadas como credencial.',
     'Lead', '"Get a free property management quote in 48 hours" — direct CTA',
     'Story with link. Real urgency (limited slots or deadline). Number of properties managed as credential.',
     'Lead', 40);

  -- ── 2. Eventos → Lead Generation (Event Launch Sequence) ──────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_leads, ind_eventos, 'event_launch',
     'Event Launch Sequence — Expectativa → Reveal → Contenido → Urgencia',
     'Event Launch Sequence — Anticipation → Reveal → Content → Urgency',
     'Secuencia de 4 semanas antes del evento: construir expectativa → revelar y abrir early bird → mostrar el contenido/speakers → cerrar con urgencia y social proof.',
     '4-week sequence before the event: build anticipation → reveal and open early bird → show content/speakers → close with urgency and social proof.',
     'Entradas vendidas / DMs de sponsors', 'CTR en links de compra',
     'Tickets sold / Sponsor DMs', 'Purchase link CTR',
     layers_3cap,
     'Para tickets: urgencia real (cupos o precio escalonado). Para sponsors: propuesta de valor en DM con deck adjunto.',
     'For tickets: real urgency (limited slots or tiered pricing). For sponsors: value prop DM with deck attached.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_eventos;

  IF s_eventos IS NULL THEN
    SELECT id INTO s_eventos FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_eventos;
  END IF;

  -- Eventos templates (4 semanas)
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_eventos, 1, 1, 'post', 'instagram',
     'Teaser de expectativa: "Algo grande viene este [mes]. No te lo puedes perder."',
     'Imagen con fecha o cuenta regresiva. Cero detalles del evento. El misterio es el gancho. CTA: "Activa las notificaciones".',
     'Awareness', 'Anticipation teaser: "Something big is coming this [month]. You can''t miss it."',
     'Image with date or countdown. Zero event details. The mystery is the hook. CTA: "Turn on notifications".',
     'Awareness', 10),
    (s_eventos, 2, 1, 'carrusel', 'general',
     'Reveal del evento + apertura de early bird (precio especial primeras 48h)',
     'Slide 1: anuncio oficial con fecha/lugar. Slides 2-4: qué vas a aprender / vivir / conocer. Slide final: precio early bird con fecha límite clara.',
     'Lead / Ticket', 'Event reveal + early bird opening (special price first 48h)',
     'Slide 1: official announcement with date/venue. Slides 2-4: what you will learn/experience/meet. Final slide: early bird price with clear deadline.',
     'Lead / Ticket', 20),
    (s_eventos, 3, 1, 'post', 'general',
     'Speaker spotlight: "Conoce a [Nombre] — uno de los speakers principales del evento"',
     'Foto del speaker + 3 logros concretos + un insight o frase del speaker. Un post por speaker, publicar 1 por día en la semana 3.',
     'Consideración', 'Speaker spotlight: "Meet [Name] — one of the main event speakers"',
     'Speaker photo + 3 concrete achievements + one speaker insight or quote. One post per speaker, publish 1 per day in week 3.',
     'Consideration', 30),
    (s_eventos, 4, 1, 'story', 'instagram',
     'Urgencia final: "Solo quedan X lugares / el precio sube en 48h — [Nombre de X personas] ya confirmaron"',
     'Combinar contador de entradas vendidas (social proof) con urgencia de precio. Screenshot de confirmaciones (anónimas). Link directo a compra.',
     'Conversión', 'Final urgency: "Only X spots left / price goes up in 48h — [X people] already confirmed"',
     'Combine sold tickets counter (social proof) with price urgency. Anonymous confirmation screenshots. Direct purchase link.',
     'Conversion', 40);

  -- ── 3. B2B / SaaS → Lead Generation (TOFU-MOFU-BOFU) ─────────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_leads, ind_b2b, 'tofu_mofu_bofu',
     'TOFU-MOFU-BOFU — Awareness → Consideración → Decisión',
     'TOFU-MOFU-BOFU — Awareness → Consideration → Decision',
     'TOFU: tendencias + hot takes para capturar tomadores de decisión. MOFU: casos de uso con ROI real para quienes ya te conocen. BOFU: testimonios y demo para quienes están listos para decidir.',
     'TOFU: trends + hot takes to capture decision makers. MOFU: use cases with real ROI for those who already know you. BOFU: testimonials and demo for those ready to decide.',
     'Leads calificados (DMs / formularios de tomadores de decisión)', 'Saves / Shares del contenido TOFU',
     'Qualified leads (DMs / forms from decision makers)', 'TOFU content saves / shares',
     layers_3cap,
     'Quienes guardan o comparten contenido TOFU → enviar contenido MOFU por DM como "seguimiento natural" ("Vi que te interesó el tema de X, tengo un caso real que te puede servir").',
     'Those who save or share TOFU content → send MOFU content via DM as "natural follow-up" ("I saw you were interested in X topic, I have a real case that might help").')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_b2b;

  IF s_b2b IS NULL THEN
    SELECT id INTO s_b2b FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_b2b;
  END IF;

  -- B2B templates
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_b2b, 1, 1, 'post', 'linkedin',
     'TOFU: Tendencia del mercado + tu opinión honesta (hot take)',
     'Dato de industria reciente + tu interpretación controversial. Formato: "El mercado dice X. Yo creo que en realidad es Y. Aquí por qué." Invitar debate en comentarios.',
     'Awareness + posicionamiento', 'TOFU: Industry trend + your honest opinion (hot take)',
     'Recent industry data + your controversial interpretation. Format: "The market says X. I think it''s actually Y. Here''s why." Invite debate in comments.',
     'Awareness + positioning', 10),
    (s_b2b, 2, 1, 'post', 'linkedin',
     'TOFU: "3 señales de que tu [proceso/herramienta/equipo] ya no escala"',
     'Lista de señales de alerta que los tomadores de decisión reconocen. Sin mencionar tu solución todavía. Pregunta final: "¿Cuántas de estas les pasan a ustedes?"',
     'Awareness + dolor reconocido', 'TOFU: "3 signs that your [process/tool/team] no longer scales"',
     'List of warning signs that decision makers recognize. No mention of your solution yet. Final question: "How many of these are happening to you?"',
     'Awareness + recognized pain', 20),
    (s_b2b, 3, 1, 'carrusel', 'linkedin',
     'MOFU: Caso de uso específico — cómo [Cliente tipo] resolvió [problema] con [tu solución] y obtuvo [resultado concreto]',
     'Slide 1: el problema (específico, con cifra). Slide 2: qué intentaron antes y por qué falló. Slide 3: la solución que aplicaron. Slide 4: resultado con número real. Slide 5: CTA a demo o call.',
     'Consideración', 'MOFU: Use case — how [Client type] solved [problem] with [your solution] and got [concrete result]',
     'Slide 1: the problem (specific, with a number). Slide 2: what they tried before and why it failed. Slide 3: the solution they applied. Slide 4: result with real number. Slide 5: CTA to demo or call.',
     'Consideration', 30),
    (s_b2b, 4, 1, 'reel', 'linkedin',
     'BOFU: Demo de 60 segundos + testimonio de cliente — "¿Cómo sería trabajar con nosotros?"',
     'Video corto mostrando el proceso real en 3 pasos. Terminar con un clip del cliente diciendo el resultado. CTA directo: "Agendemos una demo de 15 min".',
     'Decisión / Conversión', 'BOFU: 60-second demo + client testimonial — "What would it be like to work with us?"',
     'Short video showing the real process in 3 steps. End with a client clip stating the result. Direct CTA: "Let''s schedule a 15-min demo".',
     'Decision / Conversion', 40);

  -- ── 4. eCommerce → Conversion (Weekly Content Mix) ───────────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_conversion, ind_ecomm, 'weekly_mix',
     'Weekly Content Mix — Educativo · UGC · Oferta · Dato',
     'Weekly Content Mix — Educational · UGC · Offer · Fact',
     'Ciclo semanal recurrente con 4 piezas fijas: Lunes educativo → Miércoles UGC/reseña → Viernes oferta con urgencia → Domingo dato curioso. Siempre con fricción de compra reducida.',
     'Recurring weekly cycle with 4 fixed pieces: Monday educational → Wednesday UGC/review → Friday offer with urgency → Sunday curious fact. Always with reduced purchase friction.',
     'Conversiones directas', 'Tasa de respuesta a DMs',
     'Direct conversions', 'DM response rate',
     layers_3cap,
     'Siempre con fricción reducida en el CTA: un solo clic, pago guardado, cuotas visibles, link directo a producto. No más de 1 clic entre el post y el carrito.',
     'Always with reduced friction in CTA: one click, saved payment, installments visible, direct product link. No more than 1 click between the post and the cart.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_ecomm;

  IF s_ecomm IS NULL THEN
    SELECT id INTO s_ecomm FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_ecomm;
  END IF;

  -- eCommerce templates (patrón semanal recurrente — mostrar semana 1)
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_ecomm, 1, 1, 'post', 'instagram',
     'Lunes: El problema que resuelve tu producto (educativo — sin vender todavía)',
     'Empieza con el dolor o la situación que el cliente vive. Descríbelo de forma empática y específica. En el último párrafo, menciona sutilmente que existe una solución. Link en bio.',
     'Awareness + educación', 'Monday: The problem your product solves (educational — no selling yet)',
     'Start with the pain or situation the customer experiences. Describe it empathetically and specifically. In the last paragraph, subtly mention that a solution exists. Link in bio.',
     'Awareness + education', 10),
    (s_ecomm, 1, 2, 'carrusel', 'instagram',
     'Miércoles: Reseña real de cliente — "Lo que [Nombre] dice de [Producto]"',
     'Foto o captura del cliente usando el producto. Cita textual de su reseña. Slides adicionales con el producto en contexto real. CTA: "Lee más reseñas → link en bio".',
     'Prueba social', 'Wednesday: Real customer review — "What [Name] says about [Product]"',
     'Photo or screenshot of customer using the product. Verbatim quote from their review. Additional slides with product in real context. CTA: "Read more reviews → link in bio".',
     'Social proof', 20),
    (s_ecomm, 1, 3, 'post', 'instagram',
     'Viernes: Oferta o bundle de la semana — urgencia real (solo hasta el domingo)',
     'Presentar el bundle o descuento con fecha límite clara. Foto del producto con el precio tachado y el precio real. CTA directo con link al carrito. "Solo 48 horas."',
     'Conversión directa', 'Friday: Weekly offer or bundle — real urgency (only until Sunday)',
     'Present the bundle or discount with a clear deadline. Product photo with crossed-out price and real price. Direct CTA with cart link. "Only 48 hours."',
     'Direct conversion', 30),
    (s_ecomm, 1, 4, 'post', 'instagram',
     'Domingo: "¿Sabías que...?" — dato curioso sobre el producto o el proceso de fabricación',
     'Un dato que la mayoría no sabe sobre el producto, el ingrediente, el proceso o la historia detrás. Formato: "¿Sabías que [dato sorprendente]? Nosotros [conexión con el producto]."',
     'Engagement + marca', 'Sunday: "Did you know...?" — curious fact about the product or manufacturing process',
     'A fact that most people don''t know about the product, ingredient, process, or the story behind it. Format: "Did you know that [surprising fact]? We [connection to product]."',
     'Engagement + brand', 40);

  -- ── 5. Educación → Lead Generation (Escalera de Valor) ───────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_leads, ind_edu, 'value_ladder',
     'Escalera de Valor — Enseñanza Gratuita → Lead Magnet → Webinar → Oferta',
     'Value Ladder — Free Teaching → Lead Magnet → Webinar → Offer',
     'Contenido educativo gratuito de alto valor → Lead magnet (PDF/checklist) → Nurturing por email (5-7 correos) → Webinar o sesión gratuita → Oferta del programa con bonus por tiempo limitado.',
     'High-value free educational content → Lead magnet (PDF/checklist) → Email nurturing (5-7 emails) → Free webinar or session → Program offer with time-limited bonus.',
     'Leads para llamada o inscripción al programa', 'Tasa de apertura del lead magnet',
     'Leads for call or program enrollment', 'Lead magnet open/download rate',
     layers_3cap,
     'Webinar con estructura: problema vivido → metodología probada → caso de transformación real → oferta con bonus de acción rápida.',
     'Webinar structure: lived problem → proven methodology → real transformation case → offer with fast-action bonus.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_edu;

  IF s_edu IS NULL THEN
    SELECT id INTO s_edu FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_edu;
  END IF;

  -- Educación templates
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_edu, 1, 1, 'carrusel', 'instagram',
     'Contenido educativo puro: "Los [N] pasos para lograr [resultado deseado por tu audiencia]"',
     'Cada slide = un paso accionable. Sin pedir nada a cambio. El valor es tan alto que el lector quiere más. Último slide: "¿Quieres el framework completo? → Descarga gratis en bio."',
     'Awareness + autoridad', 'Pure educational content: "The [N] steps to achieve [desired result for your audience]"',
     'Each slide = one actionable step. No asking for anything in return. The value is so high the reader wants more. Last slide: "Want the full framework? → Free download in bio."',
     'Awareness + authority', 10),
    (s_edu, 1, 2, 'post', 'instagram',
     'Transformación de alumno: "De [situación inicial] a [resultado] en [tiempo]"',
     'Historia real de un alumno o cliente. Específico y concreto: qué cambió, cómo cambió, cuánto tardó. Sin revelar el programa todavía. CTA: "¿Quieres el mismo resultado?"',
     'Prueba social + deseo', 'Student transformation: "From [initial situation] to [result] in [time]"',
     'Real student or client story. Specific and concrete: what changed, how it changed, how long it took. No program mention yet. CTA: "Want the same result?"',
     'Social proof + desire', 20),
    (s_edu, 2, 1, 'story', 'instagram',
     'Pregunta de calificación + CTA al lead magnet: "¿Cuál es tu mayor problema con [tema]?"',
     'Encuesta en story con 2-3 opciones. Responder personalmente a cada respuesta. Terminar con link directo al lead magnet gratuito. "Te mando el recurso que te va a ayudar."',
     'Calificación + lead magnet', 'Qualification question + CTA to lead magnet: "What is your biggest problem with [topic]?"',
     'Story poll with 2-3 options. Reply personally to each response. End with direct link to free lead magnet. "I''ll send you the resource that will help you."',
     'Qualification + lead magnet', 10),
    (s_edu, 3, 1, 'post', 'general',
     'Invitación a webinar gratuito: "Aprende [resultado específico] en 60 minutos — sin costo"',
     'Fecha y hora clara. Qué se lleva el asistente (3 puntos concretos). Quién eres tú y por qué deberían confiar en ti (brevísimo). Registro en link de bio. Urgencia: cupos limitados.',
     'Registro a webinar', 'Free webinar invitation: "Learn [specific result] in 60 minutes — no cost"',
     'Clear date and time. What attendees will get (3 concrete points). Who you are and why they should trust you (very brief). Register via link in bio. Urgency: limited spots.',
     'Webinar registration', 30),
    (s_edu, 4, 1, 'carrusel', 'instagram',
     'Oferta del programa: "Abre inscripciones por 72 horas — [bonus especial] para los primeros [N]"',
     'Slide 1: anuncio de apertura + bonus sorpresa. Slide 2: qué incluye el programa (3 grandes resultados). Slide 3: quién es ideal para esto. Slide 4: precio + garantía. Slide 5: CTA con countdown.',
     'Conversión directa', 'Program launch: "Enrollment opens for 72 hours — [special bonus] for the first [N]"',
     'Slide 1: opening announcement + surprise bonus. Slide 2: what the program includes (3 big results). Slide 3: who is ideal for this. Slide 4: price + guarantee. Slide 5: CTA with countdown.',
     'Direct conversion', 40);

  -- ── 6. Gastronomía → Nurturing / Retención ───────────────────────────────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_nurturing, ind_gastro, 'trust_loop',
     'Trust Loop — Contenido Visual + Behind the Scenes + Comunidad',
     'Trust Loop — Visual Content + Behind the Scenes + Community',
     'El contenido gastronómico vende primero con los ojos, luego con la historia. Ciclo: plato visual → historia humana → comunidad activa (UGC) → oferta con descuento para followers.',
     'Food content sells first with the eyes, then with the story. Cycle: visual dish → human story → active community (UGC) → offer with follower discount.',
     'Reservas / pedidos / visitas', 'Tasa de respuesta a mentions/stories',
     'Reservations / orders / visits', 'Mention/story response rate',
     layers_3cap,
     'Responder cada story/mención manualmente para humanizar la marca. Link directo a reserva o WhatsApp Business con respuesta automática.',
     'Respond to every story/mention manually to humanize the brand. Direct link to reservation or WhatsApp Business with automated reply.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_gastro;

  IF s_gastro IS NULL THEN
    SELECT id INTO s_gastro FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_gastro;
  END IF;

  -- Gastronomía templates
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_gastro, 1, 1, 'carrusel', 'instagram',
     'El plato protagonista de la semana: foto premium + historia del ingrediente o del chef detrás',
     'Slide 1: foto del plato en su mejor ángulo (natural light, styling). Slides 2-3: historia del ingrediente principal (origen, por qué lo eligieron). Slide 4: quién lo cocina y su técnica especial.',
     'Engagement + identidad de marca', 'The star dish of the week: premium photo + story of the ingredient or chef behind it',
     'Slide 1: dish photo at its best angle (natural light, styling). Slides 2-3: story of the main ingredient (origin, why they chose it). Slide 4: who cooks it and their special technique.',
     'Engagement + brand identity', 10),
    (s_gastro, 2, 1, 'reel', 'instagram',
     '"Behind the kitchen" — 30 segundos mostrando la preparación del plato desde adentro',
     'Formato: time-lapse o reel en cámara rápida de la preparación. Música que refleje el vibe del local. Sin texto pesado, solo subtítulos simples. Terminar con el plato listo y CTA suave.',
     'Humanización + alcance', '"Behind the kitchen" — 30 seconds showing dish preparation from the inside',
     'Format: time-lapse or fast-motion reel of the preparation. Music that reflects the venue vibe. No heavy text, just simple captions. End with the finished dish and a soft CTA.',
     'Humanization + reach', 20),
    (s_gastro, 3, 1, 'story', 'instagram',
     'Descuento exclusivo para followers: "Solo para los que nos siguen — [X]% off esta semana"',
     'Story simple: código de descuento exclusivo + vigencia corta (48-72h). Instrucción clara de cómo canjearlo. Repostear en highlights para ampliar el alcance.',
     'Retención + conversión', 'Exclusive follower discount: "Only for our followers — [X]% off this week"',
     'Simple story: exclusive discount code + short validity (48-72h). Clear instruction on how to redeem it. Repost to highlights to extend reach.',
     'Retention + conversion', 30),
    (s_gastro, 4, 1, 'post', 'instagram',
     'UGC: "Esta semana la foto ganadora es de [cliente] 📸 — así se ve nuestro [plato] en manos de ustedes"',
     'Pedir permiso y repostear la mejor foto de un cliente de la semana. Mencionarlos. Agregar 1-2 líneas del equipo sobre por qué les encanta ver eso. CTA: "Etiquétanos y el próximo podrías ser tú."',
     'Comunidad + UGC', 'UGC: "This week''s winning photo is from [customer] 📸 — this is our [dish] in your hands"',
     'Ask permission and repost the best customer photo of the week. Tag them. Add 1-2 lines from the team about why they love seeing that. CTA: "Tag us and next week it could be you."',
     'Community + UGC', 40);

  -- ── 7. Salud / Fitness → Brand Awareness (Transformación + Comunidad) ─────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES
    (obj_awareness, ind_salud, 'transformation_community',
     'Transformación Visible + Comunidad — Educar · Desmitificar · Inspirar · Activar',
     'Visible Transformation + Community — Educate · Debunk · Inspire · Activate',
     'Ciclo de 4 semanas: tips accionables → desmitificación de creencias erróneas → transformación real con contexto → reto comunitario con CTA. Construye autoridad antes de pedir el clic.',
     '4-week cycle: actionable tips → debunking wrong beliefs → real transformation with context → community challenge with CTA. Build authority before asking for the click.',
     'Alcance / Impresiones', 'Nuevos seguidores calificados',
     'Reach / Impressions', 'New qualified followers',
     layers_3cap,
     'Free trial, clase gratuita o evaluación sin costo como primer paso. Friction reducida: "Reserva tu clase gratis en 30 segundos."',
     'Free trial, free class or no-cost assessment as first step. Reduced friction: "Book your free class in 30 seconds."')
  ON CONFLICT (objective_id, industry_id) DO NOTHING
  RETURNING id INTO s_salud;

  IF s_salud IS NULL THEN
    SELECT id INTO s_salud FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_salud;
  END IF;

  -- Salud templates
  INSERT INTO kefy_strategy_templates
    (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order)
  VALUES
    (s_salud, 1, 1, 'carrusel', 'instagram',
     '"3 ejercicios para [objetivo específico] en 10 minutos — sin equipamiento"',
     'Slide 1: promesa del resultado en el título. Slides 2-4: un ejercicio por slide con nombre, repeticiones y cómo hacerlo bien. Slide 5: rutina completa. Slide 6: CTA a clase gratuita.',
     'Educativo + alcance', '"3 exercises for [specific goal] in 10 minutes — no equipment needed"',
     'Slide 1: result promise in the title. Slides 2-4: one exercise per slide with name, reps and how to do it right. Slide 5: full routine. Slide 6: CTA to free class.',
     'Educational + reach', 10),
    (s_salud, 2, 1, 'post', 'instagram',
     'Desmitificación: "Mito: [creencia común errónea]. Realidad: [lo que dice la evidencia]"',
     'Formato directo: mito en negrita → realidad con explicación breve y dato concreto. 3-5 mitos por post en formato lista. Invitar a comentar con otro mito que conozcan.',
     'Autoridad + engagement', 'Debunking: "Myth: [common wrong belief]. Reality: [what the evidence says]"',
     'Direct format: myth in bold → reality with brief explanation and concrete data. 3-5 myths per post in list format. Invite to comment with another myth they know.',
     'Authority + engagement', 20),
    (s_salud, 3, 1, 'reel', 'instagram',
     'Antes/después con contexto real: "[Nombre] mejoró [métrica] en [tiempo] — así fue su proceso"',
     'No solo mostrar el resultado físico. Dar contexto: qué hacía antes, qué cambió en su mentalidad, cuánto tardó, cuál fue el momento clave. Terminar con su frase favorita del proceso.',
     'Prueba social + inspiración', 'Before/after with real context: "[Name] improved [metric] in [time] — this was their process"',
     'Don''t just show the physical result. Give context: what they did before, what changed in their mindset, how long it took, what was the key moment. End with their favorite quote from the process.',
     'Social proof + inspiration', 30),
    (s_salud, 4, 1, 'post', 'instagram',
     'Reto de comunidad: "Únete al #Reto[NombreMarca][Número] — [N] días de [hábito]"',
     'Anunciar el reto con reglas simples (1-2 pasos). Crear el hashtag propio. CTA doble: "Comparte este post con alguien que necesite este reto" + "Comenta ESTOY DENTRO". Terminar con CTA a clase/evaluación gratuita.',
     'Comunidad + leads', 'Community challenge: "Join the #[BrandName]Challenge[Number] — [N] days of [habit]"',
     'Announce the challenge with simple rules (1-2 steps). Create the branded hashtag. Double CTA: "Share this post with someone who needs this challenge" + "Comment I''M IN". End with CTA to free class/assessment.',
     'Community + leads', 40);

END $$;
