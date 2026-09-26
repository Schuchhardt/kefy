// ─── Copy del asistente IA (widget del dashboard) ────────────────────────────
//
// `toolLabels` y `toolSummaries` tienen una entrada por cada herramienta
// registrada (ASSISTANT_TOOL_NAMES en lib/assistant/summaries.ts): el
// `satisfies` hace que olvidar una sea un error de tipos. Los resúmenes los
// usa el servidor para la tarjeta de confirmación; reciben la entrada de la
// herramienta y su vista previa (`describe`) ya sin etiquetas
// <untrusted_content>.

import type { AssistantToolName, ToolSummaryFn } from '@/lib/assistant/summaries';

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: any, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;
const list = (v: any): string =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).join(', ') : '';
const quote = (v: any, max = 80): string => {
  const s = str(v);
  return s.length > max ? `«${s.slice(0, max)}…»` : `«${s}»`;
};

/** Tonos de marca (mismas etiquetas que la página de identidad). */
const toneLabels: Record<string, string> = {
  professional: 'Profesional',
  friendly: 'Amigable',
  authoritative: 'Autoritativo',
  playful: 'Divertido',
  inspirational: 'Inspiracional',
  educational: 'Educativo',
  casual: 'Casual',
  formal: 'Formal',
};

const statusLabels: Record<string, string> = {
  draft: 'borrador',
  approved: 'aprobado',
  archived: 'archivado',
  scheduled: 'programado',
  published: 'publicado',
  publishing: 'publicando',
  failed: 'fallido',
  cancelled: 'cancelado',
  pending: 'pendiente',
  active: 'activa',
  paused: 'pausada',
};

/** Frecuencias del autopilot. */
const frequencyLabels: Record<string, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Cada dos semanas',
  monthly: 'Mensual',
};

const fieldLabels: Record<string, string> = {
  title: 'título',
  body: 'texto',
  hashtags: 'hashtags',
  slides: 'slides',
  status: 'estado',
  name: 'nombre',
  tagline: 'eslogan',
  industry: 'industria',
  mission: 'misión',
  communication_style: 'estilo de comunicación',
  target_audience: 'público objetivo',
  notes: 'notas',
  niche: 'nicho',
  tone: 'tono',
  primary_color: 'color primario',
  secondary_color: 'color secundario',
  accent_color: 'color de acento',
  font_heading: 'fuente de títulos',
  font_body: 'fuente de texto',
  logo_url: 'logo',
  website_url: 'sitio web',
  social_urls: 'redes sociales',
  language: 'idioma',
  customer_locations: 'ubicación de clientes',
  differentiators: 'diferenciadores',
  challenges: 'desafíos',
  competitors: 'competidores',
  uses_emojis: 'uso de emojis',
  company_size: 'tamaño de la empresa',
};

const fields = (v: any): string =>
  Array.isArray(v) ? v.map((f) => fieldLabels[f] ?? String(f).replace(/_/g, ' ')).join(', ') : '';

const es = {
  launcherLabel: 'Abrir el asistente de Kefy',
  closeLauncherLabel: 'Cerrar el asistente',
  title: 'Asistente Kefy',
  subtitle: (brand: string) => `Trabajando en ${brand}`,
  placeholder: 'Pídele algo al asistente…',
  send: 'Enviar',
  stop: 'Detener',
  newChat: 'Nueva conversación',
  history: 'Historial',
  back: 'Volver',
  close: 'Cerrar',
  delete: 'Archivar conversación',
  emptyTitle: '¿En qué te ayudo hoy?',
  emptyHint: 'Puedo crear contenido, revisar tus métricas, responder mensajes y ajustar tu marca. Antes de publicar o responder en redes siempre te pido confirmación.',
  suggestions: [
    'Crea un carrusel sobre las ventajas de nuestro producto',
    '¿Cómo van mis publicaciones este mes?',
    'Resume mis mensajes sin leer',
    'Actualiza el tono de mi marca a más cercano',
  ],
  historyEmpty: 'Todavía no tienes conversaciones.',
  historyLoading: 'Cargando…',
  untitled: 'Conversación sin título',
  loadingConversation: 'Cargando conversación…',
  thinking: 'Pensando…',
  you: 'Tú',
  assistant: 'Asistente',
  messagesLeft: (remaining: number, limit: number) => `${remaining.toLocaleString('es-CL')} / ${limit.toLocaleString('es-CL')} mensajes`,
  messagesLeftTitle: 'Mensajes del asistente que te quedan este mes. Chatear no gasta créditos; solo lo que se genera.',

  toolLabels: {
    get_workspace_context: 'Revisando tu espacio de trabajo…',
    open_page: 'Abriendo página…',
    get_brand_profile: 'Leyendo el perfil de marca…',
    update_brand_profile: 'Actualizando el perfil de marca…',
    get_strategy_catalog: 'Revisando estrategias…',
    preview_strategy: 'Preparando la estrategia…',
    set_active_strategy: 'Activando la estrategia…',
    save_custom_strategy: 'Guardando la estrategia…',
    get_content_ideas: 'Buscando ideas de contenido…',
    list_content: 'Buscando contenidos…',
    get_content: 'Leyendo el contenido…',
    create_post: 'Creando post…',
    create_carousel: 'Creando carrusel…',
    create_reel: 'Creando reel…',
    create_manual_content: 'Guardando contenido…',
    update_content: 'Editando contenido…',
    generate_content_image: 'Generando imagen…',
    list_social_accounts: 'Revisando cuentas conectadas…',
    get_connect_account_link: 'Preparando el link de conexión…',
    list_autopilot_rules: 'Revisando el autopilot…',
    save_autopilot_rule: 'Guardando la regla…',
    delete_autopilot_rule: 'Borrando la regla…',
    run_autopilot_now: 'Ejecutando el autopilot…',
    publish_content: 'Publicando…',
    list_scheduled_posts: 'Revisando publicaciones programadas…',
    cancel_scheduled_post: 'Cancelando publicación…',
    get_analytics_overview: 'Revisando métricas…',
    list_post_performance: 'Analizando publicaciones…',
    sync_social_data: 'Sincronizando redes…',
    list_conversations: 'Revisando mensajes directos…',
    get_conversation_messages: 'Leyendo la conversación…',
    list_comments: 'Revisando comentarios…',
    reply_to_conversation: 'Enviando respuesta…',
    reply_to_comment: 'Respondiendo comentario…',
  } satisfies Record<AssistantToolName, string>,

  toolSummaries: {
    get_workspace_context: () => 'Revisar tu espacio de trabajo',
    open_page: () => 'Abrir una página del dashboard',
    get_brand_profile: () => 'Leer el perfil de marca',
    update_brand_profile: (_i, p) => {
      const f = fields(p.fields);
      const base = f ? `Actualizar ${f} del perfil de marca` : 'Actualizar el perfil de marca';
      return p.sync_org_name ? `${base} y renombrar la organización` : base;
    },
    get_strategy_catalog: () => 'Revisar el catálogo de estrategias',
    preview_strategy: () => 'Ver una estrategia',
    set_active_strategy: (_i, p) => {
      if (str(p.name)) return `Activar tu estrategia propia ${quote(str(p.name))} para toda la organización`;
      const pair = [str(p.objective), str(p.industry)].filter(Boolean).join(' · ');
      return pair ? `Activar la estrategia ${pair} para toda la organización` : 'Activar una estrategia para toda la organización';
    },
    save_custom_strategy: (i, p) => {
      const name = str(p.name, str(i.name));
      const verb = i.id ? 'Actualizar la estrategia propia' : 'Crear la estrategia propia';
      const base = name ? `${verb} ${quote(name)}` : verb;
      return p.activate ? `${base} y activarla` : base;
    },
    get_content_ideas: () => 'Buscar ideas de contenido',
    list_content: () => 'Buscar contenidos',
    get_content: () => 'Leer un contenido',
    create_post: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const img = (p.with_image ?? i.with_image) !== false ? ' con imagen' : '';
      return topic ? `Crear un post${img} sobre ${quote(topic)}` : `Crear un post${img}`;
    },
    create_carousel: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const n = Number(p.slide_count ?? i.slide_count ?? 5);
      const imgs = (p.generate_images ?? i.generate_images) !== false ? ' con imágenes' : '';
      return `Crear un carrusel de ${n} slides${imgs}${topic ? ` sobre ${quote(topic)}` : ''}`;
    },
    create_reel: (i, p) => {
      const topic = str(p.topic, str(i.topic));
      const n = Number(p.variant_count ?? i.variant_count ?? 1);
      const variants = n > 1 ? ` (${n} variantes)` : '';
      const imgs = (p.generate_images ?? i.generate_images) !== false ? ' con imágenes' : '';
      return `Crear un reel${imgs}${variants}${topic ? ` sobre ${quote(topic)}` : ''}`;
    },
    create_manual_content: (i) => {
      const title = str(i.title);
      const type = str(i.content_type, 'post');
      return title ? `Guardar el ${type} ${quote(title)} como borrador` : `Guardar un ${type} como borrador`;
    },
    update_content: (_i, p) => {
      const title = str(p.title, 'contenido');
      if (p.new_status === 'archived') return `Archivar ${quote(title)}`;
      const f = fields(p.fields);
      const warn = p.current_status === 'scheduled' ? ' (está programado)' : '';
      return `Editar ${f || 'el contenido'} de ${quote(title)}${warn}`;
    },
    generate_content_image: (i) => {
      const prompt = str(i.prompt);
      return prompt ? `Generar una imagen nueva: ${quote(prompt, 60)}` : 'Generar una imagen nueva para el contenido';
    },
    list_social_accounts: () => 'Revisar las cuentas conectadas',
    get_connect_account_link: (i) => `Preparar el link para conectar ${str(i.platform, 'una cuenta')}`,
    list_autopilot_rules: () => 'Revisar las reglas del autopilot',
    save_autopilot_rule: (i, p) => {
      const name = quote(str(p.name, str(i.name)));
      if (!i.id) return `Crear la regla de autopilot ${name}: generará y programará posts solos`;
      if (i.status === 'paused') return `Pausar la regla de autopilot ${name}`;
      if (i.status === 'active') return `Reanudar la regla de autopilot ${name}`;
      return `Editar la regla de autopilot ${name}`;
    },
    delete_autopilot_rule: (_i, p) => `Borrar la regla de autopilot ${quote(str(p.name))}`,
    run_autopilot_now: (i) => {
      const n = Array.isArray(i.rule_ids) ? i.rule_ids.length : 1;
      return n === 1 ? 'Ejecutar ahora una regla de autopilot (genera y programa un post)' : `Ejecutar ahora ${n} reglas de autopilot`;
    },
    publish_content: (i, p) => {
      const title = str(p.title, 'contenido');
      const accounts = list(p.accounts) || 'las cuentas elegidas';
      const when = i.when === 'now' ? 'ahora' : str(p.when) ? `el ${str(p.when)}` : '';
      return `Publicar ${quote(title)} en ${accounts}${when ? ` ${when}` : ''}`;
    },
    list_scheduled_posts: () => 'Revisar las publicaciones programadas',
    cancel_scheduled_post: (_i, p) => {
      const title = str(p.title, 'contenido');
      const account = str(p.account);
      const when = str(p.when);
      return `Cancelar la publicación de ${quote(title)}${account ? ` en ${account}` : ''}${when ? ` del ${when}` : ''}`;
    },
    get_analytics_overview: () => 'Revisar el resumen de métricas',
    list_post_performance: () => 'Revisar el rendimiento de tus publicaciones',
    sync_social_data: (i) => {
      const parts = [
        i.analytics !== false ? 'métricas' : '',
        i.inbox !== false ? 'mensajes y comentarios' : '',
      ].filter(Boolean);
      return `Sincronizar ${parts.join(' y ') || 'redes'} desde las redes sociales`;
    },
    list_conversations: () => 'Revisar los mensajes directos',
    get_conversation_messages: () => 'Leer una conversación',
    list_comments: () => 'Revisar los comentarios',
    reply_to_conversation: (_i, p) => {
      const to = str(p.recipient);
      const from = str(p.account);
      return `Enviar un mensaje directo${to ? ` a ${to}` : ''}${from ? ` desde ${from}` : ''}`;
    },
    reply_to_comment: (_i, p) => {
      const to = str(p.recipient);
      const from = str(p.account);
      return `Responder públicamente el comentario${to ? ` de ${to}` : ''}${from ? ` en ${from}` : ''}`;
    },
  } satisfies Record<AssistantToolName, ToolSummaryFn>,

  /** Etiquetas de los campos de la vista previa en la tarjeta de confirmación. */
  previewLabels: {
    title: 'Contenido',
    format: 'Formato',
    accounts: 'Cuentas',
    account: 'Cuenta',
    when: 'Cuándo',
    status: 'Estado',
    recipient: 'Para',
    comment: 'Comentario',
    text: 'Texto',
    topic: 'Tema',
    channel: 'Red',
    with_image: 'Con imagen',
    slide_count: 'Slides',
    generate_images: 'Con imágenes',
    current_status: 'Estado actual',
    new_status: 'Nuevo estado',
    fields: 'Campos',
    changes: 'Cambios',
    sync_org_name: 'Renombrar organización',
    objective: 'Objetivo',
    industry: 'Industria',
    framework: 'Marco',
    custom_notes: 'Notas',
    new_title: 'Título nuevo',
    hashtags: 'Hashtags',
    slides: 'Slides',
    name: 'Nombre',
    description: 'Enfoque',
    kpi_primary: 'KPI principal',
    cta_mechanic: 'Mecánica de conversión',
    weeks: 'Semanas',
    posts: 'Piezas',
    sample_topics: 'Algunos temas',
    activate: 'Activarla ahora',
    frequency: 'Frecuencia',
  } as Record<string, string>,
  fieldLabels,
  statusLabels,
  toneLabels,
  frequencyLabels,
  yes: 'Sí',
  no: 'No',

  confirm: {
    title: 'Necesito tu confirmación',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    cost: (n: number) => `Costo estimado: ${n} crédito${n === 1 ? '' : 's'}`,
    expires: (time: string) => `Vence a las ${time}`,
    expired: 'Esta confirmación venció. Pídeselo de nuevo al asistente.',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    working: 'Ejecutando…',
    failed: 'No se pudo completar',
    unknown: 'No sabemos si se completó. Vuelve a abrir la conversación para ver el resultado.',
  },

  toolStatus: {
    rejected: 'Cancelado',
    expired: 'Vencido',
    pending: 'Esperando confirmación',
    unsettled: 'Sin resultado todavía',
    unsettledHint: 'Puede que siga en curso. Vuelve a abrir la conversación más tarde para ver cómo terminó.',
    error: 'Falló',
  },

  errors: {
    subscription: 'Tu suscripción no está activa. Reactívala para seguir usando el asistente.',
    credits: (limit: number) => `Usaste los ${limit} créditos de IA de este mes. Mejora tu plan para seguir generando.`,
    assistantQuota: (limit: number) => `Usaste tus ${limit.toLocaleString('es-CL')} mensajes del asistente de este mes. Mejora tu plan para seguir conversando.`,
    rateLimit: (s: number) => s > 0 ? `Vas muy rápido. Podrás reintentar en ${s} s.` : 'Ya puedes reintentar.',
    unavailable: 'El asistente no está disponible en este momento.',
    generic: 'Algo salió mal. Inténtalo de nuevo.',
    network: 'No pudimos conectar con el asistente. Revisa tu conexión.',
    refusal: 'No puedo ayudar con esa solicitud.',
    stepLimit: 'Este pedido necesitó demasiados pasos y me detuve. Dime cómo seguir.',
    expired: 'Esta acción ya no está pendiente.',
  },

  viewPlans: 'Ver planes',
  open: 'Abrir',
  retry: 'Reintentar',
  externalLink: (host: string) => `Abrir ${host} en una pestaña nueva`,
  disabledNotice: 'Tu suscripción no está activa. Reactívala para seguir usando el asistente.',
  disabledLink: 'Ir a configuración',
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export default es;
