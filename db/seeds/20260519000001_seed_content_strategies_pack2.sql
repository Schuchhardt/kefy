-- Seed PACK 2 — full objective coverage for all 7 industries
-- Adds the 21 missing (objective × industry) combinations
-- Run AFTER 20260518000001_seed_content_strategies.sql
-- Created: 2026-05-19

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

  sid UUID;

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

-- ═══════════════════════════════════════════════════════════════════
-- INMOBILIARIO — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── Inmobiliario × Brand Awareness — Marca Personal del Agente ────
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_inmob, 'agent_brand',
    'Marca Personal del Agente — Educación · Mercado · Autoridad · Humanización',
    'Agent Personal Brand — Education · Market · Authority · Humanization',
    'Posiciona al agente o empresa como referente del mercado local. Contenido educativo sobre el mercado, datos de tendencias, opiniones honestas y humanización del equipo.',
    'Position the agent or company as the local market reference. Educational content about the market, trend data, honest opinions and team humanization.',
    'Nuevos seguidores calificados', 'Alcance orgánico por post',
    'New qualified followers', 'Organic reach per post',
    layers_3cap,
    'Perfil optimizado con CTA a link en bio (calculadora, guía o formulario gratuito). Todo post con pregunta final para activar comentarios.',
    'Optimized profile with CTA to link in bio (calculator, guide or free form). Every post ends with a question to trigger comments.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_inmob; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     '"¿Es buen momento para comprar/arrendar en [ciudad]?" — análisis honesto del mercado',
     'Slide 1: pregunta polémica como gancho. Slides 2-4: datos reales del mercado local (precio m², tendencias, oferta/demanda). Slide 5: tu opinión fundamentada. Slide 6: CTA a consulta gratuita.',
     'Autoridad + alcance',
     '"Is it a good time to buy/rent in [city]?" — honest market analysis',
     'Slide 1: controversial question as hook. Slides 2-4: real local market data (price per sqm, trends, supply/demand). Slide 5: your informed opinion. Slide 6: CTA to free consultation.',
     'Authority + reach', 10),
    (sid, 2, 1, 'reel', 'instagram',
     'Tour rápido: "Así se ve un departamento de [precio] en [barrio] hoy"',
     'Video de 30-45s mostrando una propiedad real (con permiso). Datos clave en subtítulos: precio, m², ubicación. Sin vender directamente. CTA: "¿Te interesa ver más opciones?"',
     'Alcance + curiosidad',
     'Quick tour: "This is what a [price] apartment in [neighborhood] looks like today"',
     '30-45s video showing a real property (with permission). Key data in subtitles: price, sqm, location. No direct selling. CTA: "Want to see more options?"',
     'Reach + curiosity', 20),
    (sid, 3, 1, 'post', 'linkedin',
     'Hot take: "El error más común que veo en compradores de primera vez en [ciudad]"',
     'Opinión directa y sin rodeos sobre el error (sobrefinanciarse, ignorar expensas, etc.). Datos concretos. Invitar a debatir. CTA suave al final.',
     'Posicionamiento',
     'Hot take: "The most common mistake I see in first-time buyers in [city]"',
     'Direct, no-nonsense opinion about the mistake (over-leveraging, ignoring fees, etc.). Concrete data. Invite debate. Soft CTA at the end.',
     'Positioning', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Behind the scenes: "Así es un día en la vida de un agente inmobiliario"',
     'Serie de stories mostrando el trabajo real: visita de propiedad, reunión con cliente, papeleo, cierre exitoso. Humaniza el proceso y el equipo.',
     'Humanización + confianza',
     'Behind the scenes: "A day in the life of a real estate agent"',
     'Series of stories showing the real work: property visit, client meeting, paperwork, successful closing. Humanizes the process and team.',
     'Humanization + trust', 40);

-- ── Inmobiliario × Nurturing — Ciclo de Confianza ─────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_inmob, 'trust_cycle_re',
    'Ciclo de Confianza Inmobiliaria — Actualizaciones · Guías · Testimonios · Comunidad',
    'Real Estate Trust Cycle — Updates · Guides · Testimonials · Community',
    'Para agentes o administradoras con base de seguidores existente. Mezcla de actualizaciones de mercado, guías educativas, testimonios de clientes satisfechos y contenido de comunidad local.',
    'For agents or property managers with an existing audience. Mix of market updates, educational guides, satisfied client testimonials and local community content.',
    'Tasa de engagement (guardados + compartidos)', 'DMs de clientes recurrentes',
    'Engagement rate (saves + shares)', 'Recurring client DMs',
    layers_3cap,
    'Newsletter mensual con resumen del mercado + 1 propiedad destacada. Grupo de WhatsApp VIP para clientes anteriores con alertas de propiedades.',
    'Monthly newsletter with market summary + 1 featured property. VIP WhatsApp group for past clients with property alerts.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_inmob; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     'Actualización mensual de mercado: precios, demanda y tendencias de [zona]',
     'Datos visuales del mes: variación de precios, propiedades más buscadas, tiempo promedio de arriendo/venta. Contexto breve. Invitar a preguntar en comentarios.',
     'Educación + retención',
     'Monthly market update: prices, demand and trends in [area]',
     'Visual monthly data: price variation, most searched properties, average rental/sale time. Brief context. Invite questions in comments.',
     'Education + retention', 10),
    (sid, 2, 1, 'post', 'instagram',
     'Testimonio extendido: "Cómo ayudamos a [familia/empresa] a resolver [problema específico]"',
     'Historia completa con antes/durante/después. Citar al cliente (con permiso). Incluir número concreto o dato de resultado. Sin vender directamente.',
     'Prueba social',
     'Extended testimonial: "How we helped [family/company] solve [specific problem]"',
     'Full before/during/after story. Quote the client (with permission). Include a concrete number or result data. No direct selling.',
     'Social proof', 20),
    (sid, 3, 1, 'reel', 'instagram',
     '"5 cosas que debes saber antes de arrendar en [ciudad]" — guía rápida',
     'Video de 45-60s con subtítulos. Un punto por cada 8-10 segundos. Entrega valor inmediato. CTA al final: "Guarda esto para cuando lo necesites".',
     'Educación + guardados',
     '"5 things you must know before renting in [city]" — quick guide',
     '45-60s video with subtitles. One point every 8-10 seconds. Delivers immediate value. CTA: "Save this for when you need it".',
     'Education + saves', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Encuesta de comunidad: "¿Qué tema inmobiliario te interesa más esta semana?"',
     '2-3 opciones de temas (mercado, jurídico, inversión, etc.). Usar el resultado para planificar contenido de la semana siguiente. Mostrar resultados y anunciar el contenido ganador.',
     'Comunidad + planificación',
     'Community poll: "Which real estate topic interests you most this week?"',
     '2-3 topic options (market, legal, investment, etc.). Use result to plan next week content. Show results and announce winning content.',
     'Community + planning', 40);

-- ── Inmobiliario × Conversion — Cierre Directo ────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_inmob, 'direct_close_re',
    'Cierre Directo Inmobiliario — Urgencia · Inventario · Precio · CTA',
    'Real Estate Direct Close — Urgency · Inventory · Price · CTA',
    'Contenido orientado a cierre inmediato: propiedad específica con precio y características, urgencia real (últimas unidades, precio reducido), social proof de operaciones cerradas y CTA directo.',
    'Content oriented to immediate closing: specific property with price and features, real urgency (last units, reduced price), social proof of closed deals and direct CTA.',
    'Consultas / Visitas agendadas', 'Tasa de cierre desde redes',
    'Inquiries / Scheduled visits', 'Closing rate from social media',
    layers_3cap,
    'WhatsApp Business con respuesta automática en horario laboral. Formulario de pre-calificación de 2 preguntas antes de agendar visita.',
    'WhatsApp Business with automated reply during business hours. 2-question pre-qualification form before scheduling a visit.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_inmob; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     'Propiedad destacada: "[Tipo] en [Barrio] — $X/mes · [N] hab · [N] m²"',
     'Slide 1: foto exterior + precio visible. Slides 2-5: interiores con datos clave en cada slide. Slide 6: mapa/ubicación + CTA directo (WhatsApp o formulario). Urgencia si aplica.',
     'Consulta directa',
     'Featured property: "[Type] in [Neighborhood] — $X/month · [N] bed · [N] sqm"',
     'Slide 1: exterior photo + visible price. Slides 2-5: interiors with key data on each slide. Slide 6: map/location + direct CTA (WhatsApp or form). Urgency if applicable.',
     'Direct inquiry', 10),
    (sid, 2, 1, 'reel', 'instagram',
     '"Precio reducido: esta propiedad bajó $X esta semana — ¿por qué?"',
     'Video mostrando la propiedad con el precio original tachado y el nuevo precio. Explicar brevemente el contexto (propietario que necesita cerrar rápido, etc.). CTA urgente.',
     'Urgencia + conversión',
     '"Price reduced: this property dropped $X this week — here''s why"',
     'Video showing the property with the original price crossed out and new price. Briefly explain context (owner needing to close fast, etc.). Urgent CTA.',
     'Urgency + conversion', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"[N] propiedades cerradas este mes en [zona] — ¿la tuya podría ser la próxima?"',
     'Lista de operaciones cerradas (sin datos privados): tipo, zona, tiempo en mercado. Social proof colectivo. CTA: "Agenda una valoración gratuita esta semana".',
     'Social proof + conversión',
     '"[N] properties closed this month in [area] — could yours be next?"',
     'List of closed deals (no private data): type, area, time on market. Collective social proof. CTA: "Schedule a free valuation this week".',
     'Social proof + conversion', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Última oportunidad: "Solo quedan [N] propiedades disponibles en [barrio] bajo [precio]"',
     'Story con datos de escasez reales. Foto o video corto de la propiedad. Swipe-up o link directo. Urgencia de tiempo (disponible hasta viernes, por ejemplo).',
     'Urgencia + clic',
     'Last chance: "Only [N] properties available in [neighborhood] under [price]"',
     'Story with real scarcity data. Photo or short video of the property. Swipe-up or direct link. Time urgency (available until Friday, for example).',
     'Urgency + click', 40);

-- ═══════════════════════════════════════════════════════════════════
-- EVENTOS — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── Eventos × Brand Awareness — Community Builder ─────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_eventos, 'event_community',
    'Community Builder — Recaps · Speakers · BTS · Comunidad',
    'Community Builder — Recaps · Speakers · BTS · Community',
    'Construye la marca del evento más allá de la venta de entradas. Recaps de eventos pasados, contenido de speakers, behind the scenes del equipo organizador y construcción de comunidad de asistentes.',
    'Build the event brand beyond ticket sales. Past event recaps, speaker content, behind-the-scenes of the organizing team and attendee community building.',
    'Nuevos seguidores', 'Compartidos / guardados',
    'New followers', 'Shares / saves',
    layers_3cap,
    'Hashtag propio del evento como eje de comunidad. Repostear UGC de asistentes para amplificar el alcance orgánico.',
    'Event-branded hashtag as community hub. Repost attendee UGC to amplify organic reach.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_eventos; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'reel', 'instagram',
     'Recap emocional del último evento: los mejores momentos en 60 segundos',
     'Montaje de fotos y videos del evento. Música que capture el feeling. Subtítulos con datos clave (asistentes, speakers, ciudad). Terminar con teaser del próximo evento.',
     'Alcance + FOMO',
     'Emotional recap of the last event: best moments in 60 seconds',
     'Montage of event photos and videos. Music that captures the feeling. Subtitles with key data (attendees, speakers, city). End with next event teaser.',
     'Reach + FOMO', 10),
    (sid, 2, 1, 'carrusel', 'general',
     '"Lo que aprendimos de [Speaker] en [Nombre del Evento]" — los 5 insights más compartidos',
     'Slide 1: foto del speaker + título del talk. Slides 2-5: un insight por slide con la cita textual. Slide 6: quién es el speaker (brevísimo) + CTA a próximo evento.',
     'Valor + autoridad',
     '"What we learned from [Speaker] at [Event Name]" — the 5 most shared insights',
     'Slide 1: speaker photo + talk title. Slides 2-5: one insight per slide with verbatim quote. Slide 6: who is the speaker (brief) + CTA to next event.',
     'Value + authority', 20),
    (sid, 3, 1, 'post', 'instagram',
     'UGC de asistentes: "Así vivieron [nombre del evento] quienes estuvieron ahí"',
     'Collage o repost de fotos de asistentes (con permiso). Citar 2-3 reseñas reales. Pregunta final: "¿Estarás en la próxima edición?"',
     'Comunidad + FOMO',
     'Attendee UGC: "How those who were there experienced [event name]"',
     'Collage or repost of attendee photos (with permission). Quote 2-3 real reviews. Final question: "Will you be at the next edition?"',
     'Community + FOMO', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Behind the scenes del equipo organizador: "Lo que nadie ve antes del evento"',
     'Serie de stories mostrando el montaje, reuniones, imprevistos y el equipo. Humaniza la marca del evento. Terminar con pregunta a la audiencia.',
     'Humanización',
     'Organizing team behind the scenes: "What nobody sees before the event"',
     'Story series showing setup, meetings, unexpected issues and the team. Humanizes the event brand. End with a question to the audience.',
     'Humanization', 40);

-- ── Eventos × Nurturing — Comunidad Post-Evento ───────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_eventos, 'post_event_nurture',
    'Ciclo Post-Evento — Contenido · Alumni · Teaser · Comunidad',
    'Post-Event Cycle — Content · Alumni · Teaser · Community',
    'Para mantener caliente la audiencia entre eventos: distribución de contenido del evento pasado, historias de asistentes, sneak peeks del próximo evento y activación de comunidad.',
    'Keep the audience warm between events: distribution of past event content, attendee stories, sneak peeks of the next event and community activation.',
    'Tasa de apertura de emails / DMs', 'Reservas anticipadas para próximo evento',
    'Email / DM open rate', 'Early registrations for next event',
    layers_3cap,
    'Email mensual a lista de asistentes anteriores con contenido exclusivo del evento + primera opción de acceso al próximo.',
    'Monthly email to past attendee list with exclusive event content + first access option to the next event.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_eventos; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'general',
     'Contenido del evento: "Las [N] ideas más accionables de [nombre del evento]"',
     'Curación de los mejores takeaways. Formato bullet visual. Agradecer a speakers. CTA: "Guarda esto para repasarlo". Distribuir por email y redes.',
     'Valor + retención',
     'Event content: "The [N] most actionable ideas from [event name]"',
     'Curation of best takeaways. Visual bullet format. Thank speakers. CTA: "Save this to review later". Distribute via email and social.',
     'Value + retention', 10),
    (sid, 2, 1, 'post', 'instagram',
     '"[N] meses después del evento: qué cambió para quienes aplicaron lo que aprendieron"',
     'Seguimiento a 2-3 asistentes (con permiso). Qué aprendieron, qué aplicaron, qué resultado obtuvieron. Corto y específico.',
     'Alumni + prueba social',
     '"[N] months after the event: what changed for those who applied what they learned"',
     'Follow-up with 2-3 attendees (with permission). What they learned, what they applied, what result they got. Short and specific.',
     'Alumni + social proof', 20),
    (sid, 3, 1, 'story', 'instagram',
     'Teaser del próximo evento: "Algo nuevo viene — pistas exclusivas para quienes estuvieron en [edición anterior]"',
     'Story con pistas visuales o de texto del próximo evento. Exclusivo para seguidores actuales. CTA: "Activa notificaciones para ser el primero en enterarte".',
     'Anticipación + retención',
     'Next event teaser: "Something new is coming — exclusive hints for those who attended [previous edition]"',
     'Story with visual or text hints about the next event. Exclusive for current followers. CTA: "Turn on notifications to be the first to know".',
     'Anticipation + retention', 30),
    (sid, 4, 1, 'post', 'general',
     'Encuesta de comunidad: "¿Qué temática quieres que cubramos en el próximo evento?"',
     'Post de participación con opciones concretas. Responder a cada comentario. Anunciar el resultado y mostrar que la comunidad influye en el programa.',
     'Comunidad + co-creación',
     'Community poll: "What topic do you want us to cover at the next event?"',
     'Participation post with concrete options. Reply to every comment. Announce the result and show that the community influences the program.',
     'Community + co-creation', 40);

-- ── Eventos × Conversion — Flash Sale ─────────────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_eventos, 'event_flash_sale',
    'Flash Sale de Eventos — Precio Final · Social Proof · Urgencia · Cierre',
    'Event Flash Sale — Final Price · Social Proof · Urgency · Close',
    'Semana de cierre antes del evento con 4 piezas de conversión directa: precio final antes del aumento, testimonios de ediciones anteriores, contador de entradas restantes y CTA de último momento.',
    'Closing week before the event with 4 direct conversion pieces: final price before increase, testimonials from past editions, remaining ticket counter and last-minute CTA.',
    'Entradas vendidas en la semana', 'CTR en link de compra',
    'Tickets sold in the week', 'Purchase link CTR',
    layers_3cap,
    'Email de urgencia 48h antes del cierre del precio. Contador en tiempo real de entradas disponibles en la bio.',
    '48h urgency email before price close. Real-time available ticket counter in bio.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_eventos; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'instagram',
     '"El precio sube en 72 horas — última semana al precio actual de [Nombre del Evento]"',
     'Diseño simple con precio actual bien visible y precio futuro. Fecha y hora exacta del aumento. Lista de 3 razones para no perdérselo. Link directo a compra.',
     'Urgencia de precio',
     '"Price goes up in 72 hours — last week at current price for [Event Name]"',
     'Simple design with current price clearly visible and future price. Exact date and time of increase. List of 3 reasons not to miss it. Direct purchase link.',
     'Price urgency', 10),
    (sid, 2, 1, 'carrusel', 'general',
     '"Lo que dicen quienes ya confirmaron su lugar" — testimonios de asistentes registrados',
     'Slide 1: cuántos ya están registrados (número con gancho). Slides 2-4: cita de 3 asistentes ya registrados (por qué compraron, qué esperan). Slide 5: CTA directo.',
     'Social proof + FOMO',
     '"What those who already secured their spot are saying" — testimonials from registered attendees',
     'Slide 1: how many are already registered (number as hook). Slides 2-4: quote from 3 already-registered attendees (why they bought, what they expect). Slide 5: direct CTA.',
     'Social proof + FOMO', 20),
    (sid, 3, 1, 'story', 'instagram',
     'Contador en vivo: "Quedan solo [N] entradas al precio actual"',
     'Story actualizada 2 veces al día con el contador real de entradas. Aumenta la urgencia de forma honesta. Link de compra siempre visible.',
     'Urgencia real',
     'Live counter: "Only [N] tickets left at the current price"',
     'Story updated twice a day with the real ticket counter. Builds honest urgency. Purchase link always visible.',
     'Real urgency', 30),
    (sid, 4, 1, 'reel', 'instagram',
     '"Última chance — el evento es en [N] días y esto es lo que te perderás si no vas"',
     'Video de 30s mostrando el venue, el line-up de speakers y el ambiente esperado. Terminar con precio + fecha límite. Música energética.',
     'FOMO + cierre',
     '"Last chance — the event is in [N] days and here''s what you''ll miss if you don''t go"',
     '30s video showing the venue, speaker lineup and expected atmosphere. End with price + deadline. Energetic music.',
     'FOMO + close', 40);

-- ═══════════════════════════════════════════════════════════════════
-- B2B / SAAS — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── B2B × Brand Awareness — Thought Leadership ────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_b2b, 'thought_leadership',
    'Thought Leadership — Datos · Opinión · Framework · Predicciones',
    'Thought Leadership — Data · Opinion · Framework · Predictions',
    'Posiciona al fundador o empresa como referente de la industria. Contenido de alto nivel: datos originales, opiniones provocadoras, frameworks propios y predicciones del mercado.',
    'Position the founder or company as the industry reference. High-level content: original data, provocative opinions, proprietary frameworks and market predictions.',
    'Impresiones en LinkedIn', 'Nuevos seguidores calificados (tomadores de decisión)',
    'LinkedIn impressions', 'New qualified followers (decision makers)',
    layers_3cap,
    'Newsletter semanal o quincenal como eje central de thought leadership. LinkedIn como canal primario.',
    'Weekly or biweekly newsletter as the central axis of thought leadership. LinkedIn as primary channel.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_b2b; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'linkedin',
     '"Dato sorprendente de la industria: [estadística contraintuitiva] — lo que realmente significa"',
     'Abre con el dato como gancho. 2-3 párrafos de interpretación original (no la lectura obvia). Termina con una pregunta que invite al debate. Sin mencionar tu producto.',
     'Alcance + autoridad',
     '"Surprising industry data: [counter-intuitive statistic] — what it really means"',
     'Open with the data as a hook. 2-3 paragraphs of original interpretation (not the obvious read). End with a question inviting debate. No product mention.',
     'Reach + authority', 10),
    (sid, 2, 1, 'carrusel', 'linkedin',
     'Framework original: "El [Nombre del Framework] para [resolver problema específico]"',
     'Slide 1: nombre del framework + problema que resuelve. Slides 2-5: pasos o componentes del framework con iconos simples. Slide 6: cómo aplicarlo + CTA a newsletter o recurso gratuito.',
     'Autoridad + leads de newsletter',
     'Original framework: "The [Framework Name] for [solving specific problem]"',
     'Slide 1: framework name + problem it solves. Slides 2-5: steps or components with simple icons. Slide 6: how to apply it + CTA to newsletter or free resource.',
     'Authority + newsletter leads', 20),
    (sid, 3, 1, 'post', 'linkedin',
     'Predicción: "Lo que va a cambiar en [industria] en los próximos 12 meses — y cómo prepararse"',
     'Lista de 3-5 predicciones concretas basadas en tendencias actuales. Opinión personal marcada claramente como tal. Invitar a compartir las predicciones de otros.',
     'Posicionamiento + alcance viral',
     'Prediction: "What''s going to change in [industry] in the next 12 months — and how to prepare"',
     'List of 3-5 concrete predictions based on current trends. Personal opinion clearly marked as such. Invite others to share their predictions.',
     'Positioning + viral reach', 30),
    (sid, 4, 1, 'post', 'linkedin',
     'Post de opinión: "Por qué [práctica común en la industria] está mal — y qué funciona en realidad"',
     'Toma postura clara contra una práctica estándar del sector. Argumenta con datos o experiencia propia. Propón la alternativa. Termina con pregunta.',
     'Diferenciación + debate',
     'Opinion post: "Why [common industry practice] is wrong — and what actually works"',
     'Take a clear stance against a standard sector practice. Argue with data or personal experience. Propose the alternative. End with a question.',
     'Differentiation + debate', 40);

-- ── B2B × Nurturing — Customer Success ────────────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_b2b, 'customer_success',
    'Customer Success Loop — Tutoriales · Casos · Comunidad · Upsell',
    'Customer Success Loop — Tutorials · Cases · Community · Upsell',
    'Para SaaS o consultoras con clientes activos. Contenido que reduce churn: tutoriales de producto, casos de éxito de clientes, comunidad de usuarios y contenido de expansión (upsell educativo).',
    'For SaaS or consulting with active clients. Churn-reducing content: product tutorials, client success cases, user community and expansion content (educational upsell).',
    'Churn rate mensual', 'NPS / Tasa de respuesta a encuestas',
    'Monthly churn rate', 'NPS / Survey response rate',
    layers_3cap,
    'Webinar mensual de "best practices" con clientes actuales como presentadores. Email de check-in quincenal con recurso de valor.',
    'Monthly "best practices" webinar with current clients as presenters. Biweekly check-in email with a value resource.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_b2b; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'linkedin',
     '"[N] formas de sacar más partido a [producto/servicio] que el 80% de usuarios desconoce"',
     'Tips avanzados de uso. Visual simple. Cada slide = un tip con screenshot o ilustración. CTA final: "¿Usas alguno de estos? Cuéntanos en comentarios".',
     'Retención + engagement',
     '"[N] ways to get more out of [product/service] that 80% of users don''t know"',
     'Advanced usage tips. Simple visual. Each slide = one tip with screenshot or illustration. Final CTA: "Do you use any of these? Tell us in the comments".',
     'Retention + engagement', 10),
    (sid, 2, 1, 'post', 'linkedin',
     'Caso de éxito interno: "Cómo [empresa cliente] pasó de [estado A] a [estado B] usando [tu solución]"',
     'Historia en 3 actos: situación inicial → implementación → resultado medido. Citar al cliente si es posible. Número concreto de resultado siempre.',
     'Prueba social + retención',
     'Internal success case: "How [client company] went from [state A] to [state B] using [your solution]"',
     '3-act story: initial situation → implementation → measured result. Quote the client if possible. Concrete result number always.',
     'Social proof + retention', 20),
    (sid, 3, 1, 'post', 'linkedin',
     'Feature spotlight: "Nueva funcionalidad/mejora que acaba de lanzar — y por qué importa"',
     'Presentar la nueva feature en contexto: qué problema resuelve, cómo se usa, qué resultado produce. No solo "lanzamos X", sino "ahora puedes hacer Y".',
     'Producto + retención',
     'Feature spotlight: "New feature/improvement just launched — and why it matters"',
     'Present the new feature in context: what problem it solves, how to use it, what result it produces. Not just "we launched X", but "now you can do Y".',
     'Product + retention', 30),
    (sid, 4, 1, 'carrusel', 'linkedin',
     'Upsell educativo: "¿Estás usando solo el [X]% de lo que [producto/servicio] puede hacer por tu empresa?"',
     'Slide 1: gancho con el % de uso típico. Slides 2-4: funcionalidades/servicios avanzados que la mayoría no usa. Slide 5: invitación a call de revisión de cuenta (gratuita).',
     'Expansión + upsell',
     'Educational upsell: "Are you using only [X]% of what [product/service] can do for your company?"',
     'Slide 1: hook with typical usage %. Slides 2-4: advanced features/services that most don''t use. Slide 5: invitation to a free account review call.',
     'Expansion + upsell', 40);

-- ── B2B × Conversion — Oferta Consultiva ──────────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_b2b, 'consultive_offer',
    'Oferta Consultiva — Auditoría · ROI · Urgencia · Demo',
    'Consultive Offer — Audit · ROI · Urgency · Demo',
    'Contenido de cierre para B2B: auditoría gratuita como gancho de entrada, demostración de ROI con números reales, urgencia por cupos de onboarding limitados y CTA directo a demo o llamada.',
    'Closing content for B2B: free audit as entry hook, ROI demonstration with real numbers, urgency from limited onboarding slots and direct CTA to demo or call.',
    'Demos / llamadas agendadas', 'Tasa de cierre desde redes sociales',
    'Demos / calls scheduled', 'Closing rate from social media',
    layers_3cap,
    'Cupos limitados de onboarding como urgencia real (no artificial). Seguimiento personalizado por DM a quienes guardan o interactúan con el contenido de BOFU.',
    'Limited onboarding slots as real (not artificial) urgency. Personalized DM follow-up to those who save or interact with BOFU content.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_b2b; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'linkedin',
     '"Auditoría gratuita de [proceso/herramienta] — te digo exactamente qué está frenando tu crecimiento"',
     'Oferta clara de la auditoría gratuita (30 min). Qué incluye (3 puntos concretos). Quién es ideal para esto. Cupos limitados reales. Link a calendario.',
     'Lead calificado',
     '"Free [process/tool] audit — I''ll tell you exactly what''s slowing your growth"',
     'Clear free audit offer (30 min). What it includes (3 concrete points). Who it''s ideal for. Real limited slots. Link to calendar.',
     'Qualified lead', 10),
    (sid, 2, 1, 'carrusel', 'linkedin',
     'Calculadora de ROI: "¿Cuánto te cuesta no tener [tu solución]?" — con números reales',
     'Slide 1: pregunta impactante. Slides 2-4: desglose de costos ocultos del problema (tiempo, errores, oportunidades perdidas). Slide 5: comparativa con el costo de la solución. Slide 6: CTA a demo.',
     'Consideración + conversión',
     'ROI calculator: "How much is NOT having [your solution] costing you?" — with real numbers',
     'Slide 1: impactful question. Slides 2-4: breakdown of hidden problem costs (time, errors, missed opportunities). Slide 5: comparison with solution cost. Slide 6: demo CTA.',
     'Consideration + conversion', 20),
    (sid, 3, 1, 'post', 'linkedin',
     '"Solo quedan [N] cupos de onboarding para [mes] — por qué limitamos los ingresos"',
     'Explicar honestamente por qué limitan los cupos (calidad de implementación, atención personalizada). Cuántos quedan. CTA urgente pero sin presión artificial.',
     'Urgencia + conversión',
     '"Only [N] onboarding spots left for [month] — why we limit our intake"',
     'Honestly explain why slots are limited (implementation quality, personalized attention). How many are left. Urgent CTA without artificial pressure.',
     'Urgency + conversion', 30),
    (sid, 4, 1, 'reel', 'linkedin',
     'Demo en 90 segundos: "Así resuelve [producto/servicio] el problema de [cliente tipo] en 3 pasos"',
     'Screenshare o video del producto en acción. Narración en off. Caso real como contexto. Terminar con CTA directa: "¿Quieres ver cómo funciona para tu empresa? Agenda 15 min".',
     'Decisión + demo',
     '90-second demo: "How [product/service] solves [client type]''s problem in 3 steps"',
     'Screenshare or product video in action. Voiceover narration. Real case as context. End with direct CTA: "Want to see how it works for your company? Book 15 min".',
     'Decision + demo', 40);

-- ═══════════════════════════════════════════════════════════════════
-- eCOMMERCE — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── eCommerce × Lead Generation — Lead Magnet Commerce ────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_leads, ind_ecomm, 'ecomm_lead_magnet',
    'Lead Magnet Commerce — Quiz · Guía · Descuento Bienvenida · Email',
    'Commerce Lead Magnet — Quiz · Guide · Welcome Discount · Email',
    'Capturar emails de compradores potenciales antes de la primera compra. Quiz de producto personalizado, guía de uso o descuento de bienvenida a cambio del email. Nurturing con secuencia de 3-5 emails.',
    'Capture emails from potential buyers before the first purchase. Personalized product quiz, usage guide or welcome discount in exchange for email. Nurturing with 3-5 email sequence.',
    'Emails capturados', 'Tasa de conversión de leads a primera compra',
    'Emails captured', 'Lead-to-first-purchase conversion rate',
    layers_3cap,
    'Popup de bienvenida con descuento del 10-15% a cambio del email. Secuencia de 3 emails: bienvenida + descuento → beneficios del producto → urgencia de expiración.',
    'Welcome popup with 10-15% discount in exchange for email. 3-email sequence: welcome + discount → product benefits → expiration urgency.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_ecomm; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'reel', 'instagram',
     '"¿Cuál es el [producto] perfecto para ti? — Haz el quiz gratuito (30 segundos)"',
     'Video mostrando la variedad de productos. Gancho: "No todos los [producto] son iguales". CTA claro a quiz en bio. El quiz captura email antes de mostrar el resultado.',
     'Lead magnet',
     '"What''s the perfect [product] for you? — Take the free quiz (30 seconds)"',
     'Video showing product variety. Hook: "Not all [products] are the same". Clear CTA to quiz in bio. The quiz captures email before showing the result.',
     'Lead magnet', 10),
    (sid, 2, 1, 'carrusel', 'instagram',
     'Guía gratuita: "[N] cosas que debes saber antes de comprar tu primer [producto]"',
     'Carrusel educativo con los puntos clave. Slide final: "¿Quieres la guía completa en PDF? → Link en bio (gratis a cambio de tu email)".',
     'Lead magnet educativo',
     'Free guide: "[N] things you must know before buying your first [product]"',
     'Educational carousel with key points. Final slide: "Want the full PDF guide? → Link in bio (free for your email)".',
     'Educational lead magnet', 20),
    (sid, 3, 1, 'story', 'instagram',
     'Descuento de bienvenida: "10% off en tu primera compra — solo para suscriptores nuevos"',
     'Story con código de descuento visible y vigencia de 48h. Link directo a la tienda. Urgencia real con fecha de expiración.',
     'Captura + primera compra',
     'Welcome discount: "10% off your first purchase — new subscribers only"',
     'Story with visible discount code and 48h validity. Direct link to store. Real urgency with expiration date.',
     'Capture + first purchase', 30),
    (sid, 4, 1, 'post', 'instagram',
     '"Por qué miles de personas eligen [marca] para su [necesidad] — y cómo probarlo sin riesgo"',
     'Post de prueba social con números: clientes, reseñas, años en el mercado. Terminar con la garantía o política de devolución como reducer de riesgo. CTA a primera compra.',
     'Confianza + primera compra',
     '"Why thousands choose [brand] for their [need] — and how to try it risk-free"',
     'Social proof post with numbers: customers, reviews, years in market. End with guarantee or return policy as risk reducer. CTA to first purchase.',
     'Trust + first purchase', 40);

-- ── eCommerce × Brand Awareness — Lifestyle Brand ─────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_ecomm, 'lifestyle_brand',
    'Lifestyle Brand — UGC · Historia · Valores · Detrás de Marca',
    'Lifestyle Brand — UGC · Story · Values · Behind the Brand',
    'Construye la marca más allá del producto. UGC de clientes mostrando el estilo de vida, historia de los fundadores, valores de la empresa y procesos detrás del producto.',
    'Build the brand beyond the product. Customer UGC showing the lifestyle, founder story, company values and processes behind the product.',
    'Alcance orgánico', 'UGC generado por clientes',
    'Organic reach', 'Customer-generated UGC',
    layers_3cap,
    'Hashtag propio de marca como eje de comunidad. Repostear UGC con permiso. Construir identidad visual consistente antes de escalar ads.',
    'Branded hashtag as community hub. Repost UGC with permission. Build consistent visual identity before scaling ads.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_ecomm; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'reel', 'instagram',
     '"El proceso detrás de [producto] — desde el origen hasta tus manos"',
     'Video del proceso de fabricación, selección de ingredientes o empaque. Sin texto pesado. Música que refleje los valores de la marca. Humaniza sin vender.',
     'Humanización + alcance',
     '"The process behind [product] — from origin to your hands"',
     'Video of the manufacturing process, ingredient selection or packaging. No heavy text. Music that reflects brand values. Humanizes without selling.',
     'Humanization + reach', 10),
    (sid, 2, 1, 'carrusel', 'instagram',
     'Historia de marca: "Por qué creamos [marca] — y el problema que queríamos resolver"',
     'Slide 1: el problema personal que tuvo el fundador. Slides 2-3: el camino hasta crear la solución. Slide 4: el producto hoy. Slide 5: la misión en una frase. Sin CTA de venta.',
     'Identidad + conexión emocional',
     'Brand story: "Why we created [brand] — and the problem we wanted to solve"',
     'Slide 1: the founder''s personal problem. Slides 2-3: the path to creating the solution. Slide 4: the product today. Slide 5: the mission in one sentence. No sales CTA.',
     'Identity + emotional connection', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"Esta semana el protagonista es [cliente] con su #[hashtag de marca]"',
     'UGC de un cliente real mostrando el producto en su vida cotidiana. Citar al cliente. Agregar contexto de la marca. CTA: "Etiquétanos y el próximo podrías ser tú".',
     'Comunidad + UGC',
     '"This week the star is [customer] with their #[brand hashtag]"',
     'Real customer UGC showing the product in their daily life. Tag the customer. Add brand context. CTA: "Tag us and next week it could be you".',
     'Community + UGC', 30),
    (sid, 4, 1, 'story', 'instagram',
     '"¿Qué valor de [marca] te identifica más?" — encuesta de comunidad',
     '3-4 valores de marca en la encuesta (sustentabilidad, calidad, diseño, etc.). Mostrar resultados y agradecerlos. Conectar el valor ganador con el próximo contenido.',
     'Comunidad + valores',
     '"Which [brand] value resonates with you most?" — community poll',
     '3-4 brand values in the poll (sustainability, quality, design, etc.). Show results and thank them. Connect the winning value to next content.',
     'Community + values', 40);

-- ── eCommerce × Nurturing — Community Commerce ────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_ecomm, 'community_commerce',
    'Community Commerce — Lealtad · Exclusivos · Tutoriales · Recompras',
    'Community Commerce — Loyalty · Exclusives · Tutorials · Repurchases',
    'Para tiendas con base de clientes activa. Contenido que genera recompra y lealtad: tutoriales de uso del producto, acceso exclusivo a novedades, programa de recompensas y comunidad de clientes.',
    'For stores with an active customer base. Content that drives repurchase and loyalty: product usage tutorials, exclusive access to new arrivals, rewards program and customer community.',
    'Tasa de recompra', 'LTV por cliente',
    'Repurchase rate', 'Customer LTV',
    layers_3cap,
    'Programa de puntos o cashback comunicado vía email y stories. Acceso anticipado a nuevas colecciones para clientes VIP (email list).',
    'Points or cashback program communicated via email and stories. Early access to new collections for VIP customers (email list).')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_ecomm; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'reel', 'instagram',
     '"[N] formas de usar [producto] que probablemente no conocías"',
     'Video mostrando usos alternativos o creativos del producto. Rápido y visual. CTA: "Guarda esto para tu próximo pedido".',
     'Retención + educación',
     '"[N] ways to use [product] you probably didn''t know"',
     'Video showing alternative or creative product uses. Fast and visual. CTA: "Save this for your next order".',
     'Retention + education', 10),
    (sid, 2, 1, 'post', 'instagram',
     'Acceso exclusivo: "Primeras imágenes de la nueva colección — solo para nuestra comunidad"',
     'Fotos o video de la nueva colección antes del lanzamiento oficial. Exclusivo para seguidores. Generar lista de espera o pre-orden. Sentido de pertenencia.',
     'Lealtad + anticipación',
     'Exclusive access: "First images of the new collection — for our community only"',
     'Photos or video of new collection before official launch. Exclusive for followers. Generate waitlist or pre-order. Sense of belonging.',
     'Loyalty + anticipation', 20),
    (sid, 3, 1, 'carrusel', 'instagram',
     '"Los más vendidos del mes y por qué los clientes los eligen una y otra vez"',
     'Top 3-4 productos más recomprados. Foto + cita de cliente real + dato de popularidad. CTA: "¿Ya tienes el tuyo?"',
     'Social proof + recompra',
     '"Best sellers of the month and why customers choose them again and again"',
     'Top 3-4 most repurchased products. Photo + real customer quote + popularity data. CTA: "Do you already have yours?"',
     'Social proof + repurchase', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Programa de lealtad: "Por ser cliente frecuente, tienes [X]% de descuento esta semana"',
     'Story personalizada para clientes recurrentes (comunicada también por email). Código exclusivo. Vigencia corta. Sentido de recompensa.',
     'Fidelización + conversión',
     'Loyalty program: "As a frequent customer, you have [X]% off this week"',
     'Personalized story for recurring customers (also communicated via email). Exclusive code. Short validity. Sense of reward.',
     'Loyalty + conversion', 40);

-- ═══════════════════════════════════════════════════════════════════
-- EDUCACIÓN — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── Educación × Brand Awareness — Autoridad Educativa ─────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_edu, 'edu_authority',
    'Autoridad Educativa — Enseñanza · Desmitificación · POV · Transformaciones',
    'Educational Authority — Teaching · Debunking · POV · Transformations',
    'Posiciona al educador o plataforma como la referencia del nicho. Contenido de alto valor sin pedir nada: enseñanza directa, desmitificación de creencias erróneas, punto de vista original y transformaciones reales.',
    'Position the educator or platform as the niche reference. High-value content without asking for anything: direct teaching, debunking wrong beliefs, original point of view and real transformations.',
    'Nuevos seguidores calificados', 'Guardados por post',
    'New qualified followers', 'Saves per post',
    layers_3cap,
    'Bio optimizada con lead magnet gratuito (checklist, mini-curso, PDF) para convertir seguidores en leads. Todo post de valor apunta a ese recurso.',
    'Optimized bio with free lead magnet (checklist, mini-course, PDF) to convert followers to leads. Every value post points to that resource.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_edu; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     '"El método de [resultado deseado] que nadie te enseña en [institución tradicional]"',
     'Slide 1: gancho que contrasta con la educación tradicional. Slides 2-5: el método en pasos accionables. Slide 6: CTA a recurso gratuito relacionado.',
     'Autoridad + guardados',
     '"The [desired result] method that nobody teaches you in [traditional institution]"',
     'Slide 1: hook contrasting with traditional education. Slides 2-5: the method in actionable steps. Slide 6: CTA to related free resource.',
     'Authority + saves', 10),
    (sid, 2, 1, 'reel', 'instagram',
     '"Mito de [nicho]: si crees esto, estás perdiendo tiempo y dinero"',
     'Video de 30-45s desmitificando una creencia común del nicho. Directo y sin rodeos. Dato o evidencia en pantalla. CTA: "Sigue para más contenido así".',
     'Alcance + autoridad',
     '"[Niche] myth: if you believe this, you''re wasting time and money"',
     '30-45s video debunking a common niche belief. Direct and straightforward. On-screen data or evidence. CTA: "Follow for more content like this".',
     'Reach + authority', 20),
    (sid, 3, 1, 'post', 'instagram',
     'POV: "Por qué [enfoque convencional en el nicho] ya no funciona — y qué hacer en cambio"',
     'Opinión fundamentada con datos o experiencia propia. 2-3 razones por las que el enfoque viejo falla. La alternativa en 2-3 puntos concretos. Pregunta final.',
     'Diferenciación + engagement',
     'POV: "Why [conventional approach in the niche] no longer works — and what to do instead"',
     'Opinion backed by data or personal experience. 2-3 reasons why the old approach fails. The alternative in 2-3 concrete points. Final question.',
     'Differentiation + engagement', 30),
    (sid, 4, 1, 'carrusel', 'instagram',
     '"Transformación real: de [situación inicial] a [resultado] — el proceso completo"',
     'Historia de alumno o caso propio. Específico y honesto (incluyendo obstáculos). Slide 1: gancho con el resultado. Slides 2-4: el proceso. Slide 5: el aprendizaje clave. Slide 6: CTA.',
     'Prueba de posibilidad',
     '"Real transformation: from [initial situation] to [result] — the full process"',
     'Student story or own case. Specific and honest (including obstacles). Slide 1: result hook. Slides 2-4: the process. Slide 5: the key learning. Slide 6: CTA.',
     'Proof of possibility', 40);

-- ── Educación × Nurturing — Comunidad de Aprendizaje ──────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_edu, 'learning_community',
    'Comunidad de Aprendizaje — Progreso · Alumni · Lives · Recursos',
    'Learning Community — Progress · Alumni · Lives · Resources',
    'Para educadores con alumnos activos o audiencia comprometida. Mantener el engagement entre lanzamientos: posts de progreso de alumnos, sesiones en vivo de preguntas, recursos adicionales y comunidad activa.',
    'For educators with active students or engaged audience. Maintain engagement between launches: student progress posts, live Q&A sessions, additional resources and active community.',
    'Tasa de completación de cursos', 'Engagement en comunidad',
    'Course completion rate', 'Community engagement',
    layers_3cap,
    'Grupo de comunidad (Discord, Slack, Telegram) como espacio de práctica. Live semanal o quincenal de preguntas y respuestas para mantener el momentum.',
    'Community group (Discord, Slack, Telegram) as practice space. Weekly or biweekly live Q&A to maintain momentum.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_edu; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'instagram',
     '"[Alumno] acaba de [logro específico] — así fue su camino dentro del programa"',
     'Historia de progreso real de un alumno activo. Concreto: qué aprendió, qué aplicó, qué resultado obtuvo. Con permiso del alumno. Sin spoilers del programa.',
     'Prueba social + motivación',
     '"[Student] just [specific achievement] — here''s their journey inside the program"',
     'Real active student progress story. Concrete: what they learned, what they applied, what result they got. With student permission. No program spoilers.',
     'Social proof + motivation', 10),
    (sid, 2, 1, 'story', 'instagram',
     'Live de preguntas: "Esta semana respondo en vivo todo sobre [tema del módulo actual]"',
     'Anuncio del live con fecha y hora. Invitar a dejar preguntas en comentarios. Durante el live: responder directamente y agregar valor extra no-guionado.',
     'Comunidad + retención',
     'Live Q&A: "This week I answer everything about [current module topic] live"',
     'Live announcement with date and time. Invite questions in comments. During live: answer directly and add extra unscripted value.',
     'Community + retention', 20),
    (sid, 3, 1, 'carrusel', 'instagram',
     'Recurso adicional gratuito: "El [nombre del recurso] que complementa el módulo [N]"',
     'Distribución de un recurso adicional (checklist, plantilla, lectura). Relacionado con el módulo o tema del momento. CTA: "Descárgalo gratis en bio".',
     'Valor + retención',
     'Free additional resource: "The [resource name] that complements module [N]"',
     'Distribution of an additional resource (checklist, template, reading). Related to the current module or topic. CTA: "Download free in bio".',
     'Value + retention', 30),
    (sid, 4, 1, 'post', 'instagram',
     'Encuesta de comunidad: "¿Cuál es tu mayor obstáculo en [tema] ahora mismo?"',
     'Post de participación abierta. Responder personalmente a los comentarios. Usar las respuestas para planificar contenido futuro y mostrar que la comunidad co-crea el programa.',
     'Comunidad + co-creación',
     'Community question: "What''s your biggest obstacle with [topic] right now?"',
     'Open participation post. Reply personally to comments. Use responses to plan future content and show community co-creates the program.',
     'Community + co-creation', 40);

-- ── Educación × Conversion — Lanzamiento Clásico ──────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_edu, 'classic_launch',
    'Lanzamiento Clásico — Apertura · Beneficios · Objeciones · Cierre',
    'Classic Launch — Opening · Benefits · Objections · Close',
    'Semana de lanzamiento con secuencia de 4 piezas: apertura con urgencia, beneficios y transformación, manejo de objeciones y cierre con bonus de acción rápida.',
    'Launch week with 4-piece sequence: opening with urgency, benefits and transformation, objection handling and close with fast-action bonus.',
    'Inscripciones en la semana de lanzamiento', 'Tasa de conversión de lista de espera',
    'Enrollments during launch week', 'Waitlist-to-enrollment conversion rate',
    layers_3cap,
    'Bonus de acción rápida (primeras 24h) con valor real. Email diario durante la semana de lanzamiento a la lista de espera. Contador de cupos visible.',
    'Fast-action bonus (first 24h) with real value. Daily email during launch week to the waitlist. Visible enrollment counter.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_edu; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'instagram',
     '"Se abren inscripciones a [nombre del programa] — [N] cupos, cierra el [fecha]"',
     'Anuncio limpio: qué es el programa, para quién es, cuánto dura, cuánto cuesta, cuántos cupos. Bonus de las primeras 24h bien visible. Link de inscripción directo.',
     'Apertura + urgencia',
     '"[Program name] enrollment is now open — [N] spots, closes [date]"',
     'Clean announcement: what the program is, who it''s for, duration, price, how many spots. First 24h bonus clearly visible. Direct enrollment link.',
     'Opening + urgency', 10),
    (sid, 2, 1, 'carrusel', 'instagram',
     '"Dentro de [programa]: qué vas a aprender, lograr y transformar en [duración]"',
     'Slide 1: la transformación en una frase. Slides 2-4: los 3 grandes resultados del programa. Slide 5: para quién es (y para quién NO es). Slide 6: precio + CTA con fecha límite.',
     'Consideración',
     '"Inside [program]: what you''ll learn, achieve and transform in [duration]"',
     'Slide 1: the transformation in one sentence. Slides 2-4: the 3 big program results. Slide 5: who it''s for (and who it''s NOT for). Slide 6: price + CTA with deadline.',
     'Consideration', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"Las 3 razones por las que la gente no se inscribe — y mi respuesta honesta a cada una"',
     'Las objeciones más comunes (precio, tiempo, dudas de resultado). Respuesta directa y sin defensiva a cada una. Terminar con pregunta: "¿Cuál es tu objeción real?"',
     'Objeciones',
     '"The 3 reasons people don''t enroll — and my honest answer to each one"',
     'Most common objections (price, time, result doubts). Direct, non-defensive response to each. End with: "What''s your real objection?"',
     'Objections', 30),
    (sid, 4, 1, 'reel', 'instagram',
     '"Últimas horas — lo que ocurre cuando cierras las inscripciones" (cierre urgente)',
     'Video personal y directo del educador. Recordatorio de la transformación, los cupos que quedan y la fecha de cierre exacta. Sin presión artificial, solo la realidad.',
     'Cierre urgente',
     '"Final hours — what happens when enrollment closes" (urgent close)',
     'Personal, direct video from the educator. Reminder of transformation, remaining spots and exact closing date. No artificial pressure, just reality.',
     'Urgent close', 40);

-- ═══════════════════════════════════════════════════════════════════
-- GASTRONOMÍA — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── Gastronomía × Lead Generation — Hambre Visual ─────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_leads, ind_gastro, 'food_visual_hook',
    'Hambre Visual — Fotografía · Receta Teaser · CTA Reserva · Captura',
    'Visual Hunger — Photography · Recipe Teaser · Reservation CTA · Capture',
    'Genera tráfico y reservas desde redes. Fotografía de producto de alta calidad, teaser de recetas (sin revelar todo), CTA directo a reserva/delivery y captura de datos para base de clientes.',
    'Generate traffic and reservations from social. High-quality product photography, recipe teasers (without revealing everything), direct reservation/delivery CTA and data capture for customer base.',
    'Reservas / pedidos desde redes', 'Clics en link de reserva/delivery',
    'Reservations / orders from social', 'Clicks on reservation/delivery link',
    layers_3cap,
    'Link en bio con menú interactivo + botón de reserva en 2 clics. WhatsApp Business con respuesta automática con el menú y link de reserva.',
    'Bio link with interactive menu + reservation button in 2 clicks. WhatsApp Business with automatic reply with menu and reservation link.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_gastro; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     'El plato estrella: fotografía editorial + historia del ingrediente principal',
     'Slide 1: foto premium del plato (natural light, composición profesional). Slide 2-3: el ingrediente estrella — origen, por qué lo usan, temporada. Slide 4: mesa servida con ambiente. Slide 5: CTA a reserva.',
     'Deseo + reserva',
     'The star dish: editorial photography + main ingredient story',
     'Slide 1: premium dish photo (natural light, professional composition). Slides 2-3: the star ingredient — origin, why they use it, season. Slide 4: set table with ambience. Slide 5: reservation CTA.',
     'Desire + reservation', 10),
    (sid, 2, 1, 'reel', 'instagram',
     'Teaser de receta: "Los primeros 3 pasos de nuestro [plato] — el cuarto solo se aprende viniendo"',
     'Video del proceso de preparación mostrando 3 de los 4 pasos. Cortarlo en el momento de mayor curiosidad. CTA: "¿Quieres probarlo? Reserva esta semana".',
     'Curiosidad + reserva',
     'Recipe teaser: "The first 3 steps of our [dish] — the fourth you can only learn by coming"',
     'Video of preparation process showing 3 of the 4 steps. Cut at the moment of peak curiosity. CTA: "Want to try it? Book this week".',
     'Curiosity + reservation', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"Mesa para dos disponible este [día] — [plato especial] de temporada que solo servimos [frecuencia]"',
     'Post de escasez real: el plato especial que solo está disponible en fechas limitadas. Ambiente del restaurante. CTA directo a reservar.',
     'Urgencia + reserva',
     '"Table for two available this [day] — seasonal [special dish] we only serve [frequency]"',
     'Real scarcity post: the special dish only available on limited dates. Restaurant ambience. Direct CTA to book.',
     'Urgency + reservation', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Encuesta de menú: "¿Qué plato quieres que vuelva al menú?" + CTA a reserva directa',
     'Encuesta entre 2-3 platos que la audiencia pide de vuelta. El plato ganador aparece el siguiente fin de semana. Genera anticipación y reservas anticipadas.',
     'Comunidad + reservas',
     'Menu poll: "Which dish do you want back on the menu?" + direct reservation CTA',
     'Poll between 2-3 dishes the audience requests back. The winning dish appears the following weekend. Generates anticipation and early bookings.',
     'Community + reservations', 40);

-- ── Gastronomía × Brand Awareness — Historia de Marca Gastronómica
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_awareness, ind_gastro, 'gastro_brand_story',
    'Historia de Marca Gastronómica — Origen · Equipo · Proceso · Valores',
    'Food Brand Story — Origin · Team · Process · Values',
    'Construye la identidad del restaurante o marca de alimentos más allá del plato. Historia de origen, presentación del equipo, proceso de elaboración con estándares y los valores que guían cada decisión.',
    'Build the restaurant or food brand identity beyond the dish. Origin story, team introduction, preparation process with standards and the values that guide every decision.',
    'Alcance orgánico', 'Menciones espontáneas (UGC)',
    'Organic reach', 'Spontaneous mentions (UGC)',
    layers_3cap,
    'Colaboraciones con food bloggers o influencers locales para amplificar el alcance. Geotag activo en todas las publicaciones para capturar tráfico local.',
    'Collaborations with local food bloggers or influencers to amplify reach. Active geotag on all posts to capture local traffic.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_awareness AND industry_id = ind_gastro; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     '"La historia detrás de [nombre del restaurante/marca] — por qué abrimos y qué nos mueve"',
     'Slide 1: foto del fundador en el espacio. Slide 2: el origen (de dónde viene la idea). Slide 3: el primer obstáculo y cómo lo superaron. Slide 4: la visión hoy. Sin CTA de venta.',
     'Conexión emocional',
     '"The story behind [restaurant/brand name] — why we opened and what drives us"',
     'Slide 1: founder photo in the space. Slide 2: the origin (where the idea came from). Slide 3: the first obstacle and how they overcame it. Slide 4: the vision today. No sales CTA.',
     'Emotional connection', 10),
    (sid, 2, 1, 'reel', 'instagram',
     '"Conoce al equipo de [nombre] — las personas detrás de cada plato"',
     'Presentación rápida del equipo: chef, equipo de sala, producción. Cada persona en 5-8 segundos con su nombre y rol. Música cálida. Humaniza la marca.',
     'Humanización',
     '"Meet the [name] team — the people behind every dish"',
     'Quick team introduction: chef, front of house, production. Each person in 5-8 seconds with name and role. Warm music. Humanizes the brand.',
     'Humanization', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"Por qué elegimos trabajar con [proveedor local / productor] — y qué cambia en el plato final"',
     'Historia del proveedor o productor local. Cómo afecta la calidad del ingrediente. Foto del ingrediente en su origen. Conecta el territorio con el plato. Sin CTA de venta.',
     'Valores + autoridad',
     '"Why we chose to work with [local supplier/producer] — and what it changes in the final dish"',
     'Local supplier or producer story. How it affects ingredient quality. Photo of ingredient at its source. Connects territory to the dish. No sales CTA.',
     'Values + authority', 30),
    (sid, 4, 1, 'story', 'instagram',
     '"¿Qué es lo que más valoras cuando visitas un restaurante?" — encuesta de comunidad',
     '3-4 opciones: sabor, ambiente, servicio, precio/calidad. Responder a quienes votan. Conectar el resultado con los valores y el próximo contenido.',
     'Comunidad',
     '"What do you value most when visiting a restaurant?" — community poll',
     '3-4 options: flavor, ambience, service, price/quality. Reply to those who vote. Connect result to brand values and next content.',
     'Community', 40);

-- ── Gastronomía × Conversion — Reserva Ahora ──────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_gastro, 'book_now_gastro',
    'Reserva Ahora — Menú Especial · Escasez · Ocasión · Cierre',
    'Book Now — Special Menu · Scarcity · Occasion · Close',
    'Contenido orientado a reservas inmediatas: menú especial de temporada o fecha especial, mesas limitadas como urgencia real, conexión con una ocasión (cumpleaños, aniversario, reunión) y CTA directo a reservar.',
    'Content oriented to immediate bookings: seasonal or special date menu, limited tables as real urgency, connection to an occasion (birthday, anniversary, meeting) and direct CTA to book.',
    'Reservas por semana', 'Tasa de conversión de perfil a reserva',
    'Weekly reservations', 'Profile-to-booking conversion rate',
    layers_3cap,
    'Sistema de reservas en 2 pasos máximo (link en bio → formulario o WhatsApp). Confirmación automática por WhatsApp o email.',
    'Reservation system in 2 steps maximum (link in bio → form or WhatsApp). Automatic confirmation via WhatsApp or email.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_gastro; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     'Menú de temporada: "[Nombre del Menú] — disponible solo en [fecha/período]"',
     'Slide 1: foto del plato principal con el nombre del menú. Slides 2-3: los platos del menú con descripción breve y foto. Slide 4: precio y disponibilidad. Slide 5: CTA a reserva.',
     'Urgencia + reserva',
     'Seasonal menu: "[Menu Name] — available only in [date/period]"',
     'Slide 1: main dish photo with menu name. Slides 2-3: menu dishes with brief description and photo. Slide 4: price and availability. Slide 5: reservation CTA.',
     'Urgency + reservation', 10),
    (sid, 2, 1, 'post', 'instagram',
     '"Solo quedan [N] mesas para el [fin de semana/fecha especial] — ¿tienes la tuya?"',
     'Post directo con número real de mesas disponibles. Foto del ambiente lleno y animado. CTA urgente. Sin artificios.',
     'Escasez + cierre',
     '"Only [N] tables left for [weekend/special date] — do you have yours?"',
     'Direct post with real number of available tables. Photo of full, lively atmosphere. Urgent CTA. No gimmicks.',
     'Scarcity + close', 20),
    (sid, 3, 1, 'reel', 'instagram',
     '"El lugar perfecto para [cumpleaños/aniversario/reunión de equipo] en [ciudad]"',
     'Video mostrando el espacio preparado para una celebración. Ambiente, servicio, detalles especiales. Terminar con CTA: "¿Tienes una celebración próxima? Reserva ahora".',
     'Ocasión + reserva',
     '"The perfect place for [birthday/anniversary/team gathering] in [city]"',
     'Video showing the space set up for a celebration. Atmosphere, service, special details. End with CTA: "Have an upcoming celebration? Book now".',
     'Occasion + reservation', 30),
    (sid, 4, 1, 'story', 'instagram',
     'Oferta flash: "[Plato + bebida] por $X solo esta semana — pide delivery o ven a cenar"',
     'Story simple con el combo visible y el precio. Vigencia de 5-7 días. Link directo a delivery o reserva. Foto apetitosa del combo.',
     'Flash sale + conversión',
     'Flash offer: "[Dish + drink] for $X this week only — order delivery or come for dinner"',
     'Simple story with visible combo and price. 5-7 day validity. Direct link to delivery or reservation. Appetizing combo photo.',
     'Flash sale + conversion', 40);

-- ═══════════════════════════════════════════════════════════════════
-- SALUD / FITNESS — 3 objetivos faltantes
-- ═══════════════════════════════════════════════════════════════════

-- ── Salud × Lead Generation — Gancho de Bienestar ─────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_leads, ind_salud, 'wellness_hook',
    'Gancho de Bienestar — Reto · Evaluación · Clase Gratis · Captura',
    'Wellness Hook — Challenge · Assessment · Free Class · Capture',
    'Captura leads calificados con bajo nivel de fricción: reto gratuito de 5-7 días, evaluación de salud/fitness online, clase de prueba gratuita o recurso descargable con plan de inicio.',
    'Capture qualified leads with low friction: free 5-7 day challenge, online health/fitness assessment, free trial class or downloadable resource with a starter plan.',
    'Leads capturados (DMs / formularios)', 'Tasa de conversión de lead a cliente',
    'Captured leads (DMs / forms)', 'Lead-to-client conversion rate',
    layers_3cap,
    'DM automatizado a quienes comentan una palabra clave en el post del reto (ej: "QUIERO"). La clase de prueba o evaluación sin costo como primer paso antes de vender el programa.',
    'Automated DM to those who comment a keyword on the challenge post (e.g., "YES"). The free trial class or assessment as the first step before selling the program.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_leads AND industry_id = ind_salud; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'instagram',
     '"Reto gratuito de [N] días para [resultado concreto] — comenta QUIERO y te envío el plan"',
     'Post simple con el reto descrito: qué se hace, cuánto dura, qué resultado se puede esperar. CTA: comentar una palabra clave. DM automatizado con el plan.',
     'Lead magnet + DM',
     '"Free [N]-day challenge for [concrete result] — comment YES and I''ll send you the plan"',
     'Simple post with the challenge described: what to do, how long, what result to expect. CTA: comment a keyword. Automated DM with the plan.',
     'Lead magnet + DM', 10),
    (sid, 2, 1, 'carrusel', 'instagram',
     '"Test rápido: ¿En qué nivel estás hoy?" — [N] preguntas para saber por dónde empezar',
     'Carrusel con preguntas de auto-evaluación. Slide final: "Si respondiste mayoría [X], estás en el nivel [Y] → Te mando un plan personalizado: link en bio".',
     'Calificación + lead',
     '"Quick test: What level are you at today?" — [N] questions to know where to start',
     'Self-assessment carousel. Final slide: "If you answered mostly [X], you''re at level [Y] → I''ll send you a personalized plan: link in bio".',
     'Qualification + lead', 20),
    (sid, 3, 1, 'reel', 'instagram',
     '"Tu primera clase con nosotros — gratis, sin compromiso, en [duración]"',
     'Video mostrando la dinámica real de una clase o sesión. Energético y real (no producido en exceso). CTA: "Agenda tu clase gratis esta semana — link en bio".',
     'Prueba gratuita',
     '"Your first class with us — free, no commitment, in [duration]"',
     'Video showing the real dynamics of a class or session. Energetic and real (not over-produced). CTA: "Schedule your free class this week — link in bio".',
     'Free trial', 30),
    (sid, 4, 1, 'story', 'instagram',
     '"¿Cuál es tu mayor obstáculo para empezar a [objetivo fitness]?" — 3 opciones',
     'Encuesta con las 3 objeciones más comunes (tiempo, dinero, no saber por dónde empezar). Responder personalmente a cada tipo de respuesta con una solución concreta.',
     'Calificación + nutrición de lead',
     '"What''s your biggest obstacle to starting [fitness goal]?" — 3 options',
     'Poll with the 3 most common objections (time, money, not knowing where to start). Reply personally to each response type with a concrete solution.',
     'Qualification + lead nurturing', 40);

-- ── Salud × Nurturing — Comunidad Wellness ────────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_nurturing, ind_salud, 'wellness_community',
    'Comunidad Wellness — Progreso · Tips Semanales · Retos · Check-in',
    'Wellness Community — Progress · Weekly Tips · Challenges · Check-in',
    'Para coaches, gimnasios o clínicas con clientes activos. Mantener el engagement y reducir el abandono: posts de progreso de clientes, tips semanales accionables, micro-retos de comunidad y check-ins de motivación.',
    'For coaches, gyms or clinics with active clients. Maintain engagement and reduce dropout: client progress posts, actionable weekly tips, community micro-challenges and motivation check-ins.',
    'Tasa de retención de clientes', 'Participación en retos comunitarios',
    'Client retention rate', 'Community challenge participation',
    layers_3cap,
    'Grupo privado de WhatsApp o comunidad online para check-ins diarios. Celebración pública (con permiso) de hitos de clientes para motivar al resto.',
    'Private WhatsApp group or online community for daily check-ins. Public celebration (with permission) of client milestones to motivate others.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_nurturing AND industry_id = ind_salud; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'post', 'instagram',
     '"[Cliente] cumplió [N] semanas/meses — y esto fue lo que más le costó al principio"',
     'Historia honesta de progreso: qué fue difícil, cómo lo superó, qué cambió. Citar al cliente (con permiso). Específico y motivador sin ser tóxico-positivo.',
     'Retención + inspiración',
     '"[Client] hit [N] weeks/months — and this is what was hardest at the beginning"',
     'Honest progress story: what was hard, how they overcame it, what changed. Quote the client (with permission). Specific and motivating without toxic positivity.',
     'Retention + inspiration', 10),
    (sid, 2, 1, 'carrusel', 'instagram',
     '"Tip de la semana: [hábito concreto] que marca la diferencia en [objetivo] — y cómo incorporarlo"',
     'Tip accionable en 3-4 slides: qué es, por qué funciona (brevísimo), cómo hacerlo paso a paso, qué esperar. CTA: "¿Lo pruebas esta semana? Cuéntanos en comentarios".',
     'Educación + engagement',
     '"Tip of the week: [concrete habit] that makes a difference in [goal] — and how to incorporate it"',
     'Actionable tip in 3-4 slides: what it is, why it works (brief), how to do it step by step, what to expect. CTA: "Will you try it this week? Tell us in the comments".',
     'Education + engagement', 20),
    (sid, 3, 1, 'story', 'instagram',
     'Micro-reto semanal: "Esta semana el reto es [hábito simple] — ¿te unes?"',
     'Story presentando el micro-reto (beber X vasos de agua, dormir X horas, etc.). Invitar a confirmar participación. Check-in al final de la semana con resultados.',
     'Comunidad + hábito',
     'Weekly micro-challenge: "This week''s challenge is [simple habit] — are you in?"',
     'Story presenting the micro-challenge (drink X glasses of water, sleep X hours, etc.). Invite to confirm participation. End-of-week check-in with results.',
     'Community + habit', 30),
    (sid, 4, 1, 'post', 'instagram',
     '"Check-in de motivación: ¿cómo vas con tu objetivo esta semana? — sé honesto/a"',
     'Post de participación abierta. Invitar a responder con un número del 1-10 o con una frase. Responder a cada comentario personalmente. Muestra que el coach/equipo está presente.',
     'Comunidad + conexión',
     '"Motivation check-in: how are you doing with your goal this week? — be honest"',
     'Open participation post. Invite to respond with a 1-10 number or a phrase. Reply to every comment personally. Shows the coach/team is present.',
     'Community + connection', 40);

-- ── Salud × Conversion — Oferta de Inicio ─────────────────────────
  sid := NULL;
  INSERT INTO kefy_content_strategies
    (objective_id, industry_id, framework_slug, framework_name_es, framework_name_en,
     framework_desc_es, framework_desc_en,
     kpi_primary_es, kpi_secondary_es, kpi_primary_en, kpi_secondary_en,
     interaction_layers, cta_mechanic_es, cta_mechanic_en)
  VALUES (obj_conversion, ind_salud, 'wellness_starter_offer',
    'Oferta de Inicio — Primer Mes · Resultado Rápido · Urgencia · Garantía',
    'Starter Offer — First Month · Quick Win · Urgency · Guarantee',
    'Contenido de cierre para nuevos clientes: oferta especial de primer mes con precio reducido o bonus, promesa de resultado rápido visible (quick win en 30 días), cupos limitados de inicio y garantía de satisfacción.',
    'Closing content for new clients: special first-month offer with reduced price or bonus, promise of quick visible result (quick win in 30 days), limited onboarding slots and satisfaction guarantee.',
    'Nuevos clientes captados', 'Costo de adquisición por cliente',
    'New clients acquired', 'Client acquisition cost',
    layers_3cap,
    'Oferta de primer mes con precio especial más bonus (evaluación gratis, plan personalizado, kit de inicio). Garantía de devolución de 7-14 días para reducir el riesgo percibido.',
    'First month offer with special price plus bonus (free assessment, personalized plan, starter kit). 7-14 day money-back guarantee to reduce perceived risk.')
  ON CONFLICT (objective_id, industry_id) DO NOTHING RETURNING id INTO sid;
  IF sid IS NULL THEN SELECT id INTO sid FROM kefy_content_strategies WHERE objective_id = obj_conversion AND industry_id = ind_salud; END IF;

  INSERT INTO kefy_strategy_templates (strategy_id, week_num, post_num, format, channel_hint, topic_es, copy_structure_es, goal_es, topic_en, copy_structure_en, goal_en, sort_order) VALUES
    (sid, 1, 1, 'carrusel', 'instagram',
     '"Oferta de inicio: empieza tu primer mes por $X — todo lo que incluye y por qué ahora"',
     'Slide 1: precio especial bien visible + vigencia. Slides 2-3: qué incluye (sesiones, plan, seguimiento). Slide 4: el resultado que pueden esperar en 30 días. Slide 5: garantía + CTA.',
     'Conversión directa',
     '"Starter offer: start your first month for $X — everything included and why now"',
     'Slide 1: special price clearly visible + validity. Slides 2-3: what it includes (sessions, plan, follow-up). Slide 4: the result they can expect in 30 days. Slide 5: guarantee + CTA.',
     'Direct conversion', 10),
    (sid, 2, 1, 'reel', 'instagram',
     '"En 30 días puedes [resultado concreto] — así es el proceso real con nosotros"',
     'Video del journey de 30 días: qué pasa en la semana 1, 2, 3, 4. Expectativas reales, no mágicas. Terminar con el resultado promedio que ven los clientes.',
     'Expectativas + conversión',
     '"In 30 days you can [concrete result] — here''s the real process with us"',
     'Video of the 30-day journey: what happens in week 1, 2, 3, 4. Real expectations, not magical. End with the average result clients see.',
     'Expectations + conversion', 20),
    (sid, 3, 1, 'post', 'instagram',
     '"Solo [N] cupos disponibles para empezar en [mes] — por qué limitamos los ingresos"',
     'Explicar honestamente la limitación de cupos (atención personalizada, seguimiento de calidad). Cuántos quedan. La garantía para reducir el riesgo. CTA directo.',
     'Urgencia + garantía',
     '"Only [N] spots available to start in [month] — why we limit our intake"',
     'Honestly explain the spot limitation (personalized attention, quality follow-up). How many are left. The guarantee to reduce risk. Direct CTA.',
     'Urgency + guarantee', 30),
    (sid, 4, 1, 'story', 'instagram',
     '"[Cliente] empezó hace [N] días con nuestra oferta de inicio — esto es lo que dice hoy"',
     'Testimonio breve y específico de alguien que empezó con la oferta de inicio. Qué resultado vio en los primeros 30 días. Enlace a la oferta con urgencia de cupos.',
     'Prueba social + cierre',
     '"[Client] started [N] days ago with our starter offer — here''s what they say today"',
     'Brief, specific testimonial from someone who started with the starter offer. What result they saw in the first 30 days. Link to the offer with spot urgency.',
     'Social proof + close', 40);

END $$;
