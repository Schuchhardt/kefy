// Vista de Kefy dentro del chat (MCP Apps, mcp-app/): la tarjeta de revisión
// de contenido y el plan / producción de video. Ver docs/mcp-apps.md.
//
// locales/en/mcp-app.ts se tipa con `McpAppCopy`: si falta o sobra una clave
// en inglés, no compila.

const es = {
  loading: 'Cargando…',
  connecting: 'Conectando con Kefy…',
  connectError: 'No se pudo abrir la vista de Kefy.',
  waitingResult: 'Kefy está preparando el contenido…',
  toolFailed: 'La acción no se pudo completar.',
  untitled: 'Sin título',
  close: 'Cerrar',
  cancel: 'Cancelar',
  confirm: 'Confirmar',
  save: 'Guardar',
  back: 'Volver al contenido',
  reload: 'Recargar',
  expand: 'Expandir',
  collapse: 'Contraer',
  openInKefy: 'Abrir en Kefy',
  errorPrefix: 'Error',
  noPermission: 'Esta conexión solo puede leer. Para cambiar el contenido, ábrelo en Kefy.',

  formats: { post: 'Post', carousel: 'Carrusel', reel: 'Reel', story: 'Story' },
  statuses: {
    draft: 'Borrador',
    approved: 'Aprobado',
    scheduled: 'Programado',
    published: 'Publicado',
    archived: 'Archivado',
  } as Record<string, string>,
  imageStatus: {
    generating: 'Generando imagen…',
    error: 'La imagen falló',
  } as Record<string, string>,
  renderStatus: {
    rendering: 'Montando el video…',
    ready: 'Video listo',
    not_rendered: 'Video no producido',
  } as Record<string, string>,
  createdOn: (date: string) => `Creado el ${date}`,
  variant: (n: number) => `Variante ${n}`,
  variantsLabel: 'Variantes del reel',

  preview: {
    slidePosition: (n: number, total: number) => `${n}/${total}`,
    prevSlide: 'Slide anterior',
    nextSlide: 'Slide siguiente',
    slideLabel: (n: number) => `Slide ${n}`,
    noImage: 'Sin imagen',
    videoNotProduced: 'Video no producido aún',
    videoNotProducedHint: 'Este es el guion plano a plano. Produce el video para verlo aquí.',
    seconds: (s: number) => `${s} s`,
    storyboard: 'Storyboard',
    videoLabel: (title: string) => `Video: ${title}`,
    imageAlt: (title: string) => `Imagen de «${title}»`,
  },

  scheduled: {
    title: 'Publicaciones',
    at: (date: string) => `Programado para ${date}`,
    publishedAt: (date: string) => `Publicado el ${date}`,
    viewPost: 'Ver publicación',
  },

  actions: {
    approve: 'Aprobar',
    unapprove: 'Volver a borrador',
    archive: 'Archivar',
    edit: 'Editar texto',
    regenerate: 'Regenerar imagen',
    askAgent: 'Pedir cambios',
    convert: 'Convertir a otro formato',
    produceVideo: 'Producir video',
    publish: 'Publicar o programar',
  },
  done: {
    approved: 'Aprobado.',
    unapproved: 'Volvió a borrador.',
    archived: 'Archivado.',
    saved: 'Cambios guardados.',
    imageReady: 'Imagen nueva lista.',
    converted: (format: string) => `Versión ${format} lista.`,
    askSent: 'Pedido enviado al chat. La tarjeta se actualiza cuando el asistente haga el cambio.',
  },
  slow: 'Sigue en proceso. La tarjeta se actualiza sola en unos segundos.',

  archiveConfirm: {
    title: '¿Archivar este contenido?',
    body: 'Deja de aparecer entre tus borradores. Puedes recuperarlo desde Kefy.',
  },

  edit: {
    title: 'Editar texto',
    titleField: 'Título',
    bodyField: 'Texto',
    hashtagsField: 'Hashtags',
    hashtagsHelp: 'Separados por espacios o comas.',
  },

  regenerate: {
    title: 'Regenerar imagen',
    instruction: '¿Qué cambio?',
    instructionHelp: 'Por ejemplo: «más cálida, con el logo más chico».',
    size: 'Tamaño',
    sizes: {
      '1024x1024': 'Cuadrada 1:1',
      '1080x1080': 'Cuadrada 1080',
      '1024x1536': 'Vertical 2:3',
      '1024x1792': 'Vertical 9:16',
      '1536x1024': 'Horizontal 3:2',
    } as Record<string, string>,
  },

  ask: {
    title: 'Pedir cambios al asistente',
    field: '¿Qué quieres cambiar?',
    help: 'El asistente decide cómo hacerlo (texto, imagen, formato…).',
    send: 'Enviar al chat',
    message: (id: string, instruction: string) => `Sobre el contenido ${id}: ${instruction}`,
  },

  convert: {
    title: 'Convertir a otro formato',
    help: 'El original no cambia: se crea una versión nueva en el formato elegido.',
    ready: 'Ya generada, sin costo',
  },

  credits: {
    cost: (n: number) => (n === 1 ? '1 crédito' : `${n} créditos`),
    remaining: (n: number) => `Te quedan ${n} créditos este mes.`,
    confirmTitle: 'Esta acción gasta créditos',
    confirmBody: (n: number) => `Va a costar ${n === 1 ? '1 crédito' : `${n} créditos`}.`,
    notEnough: 'No te alcanzan los créditos de este mes.',
  },

  publish: {
    title: 'Publicar o programar',
    loadingAccounts: 'Cargando tus cuentas…',
    noAccounts: 'Esta marca no tiene cuentas conectadas. Conéctalas en Kefy.',
    accounts: '¿En qué cuentas?',
    inactive: 'desconectada',
    when: '¿Cuándo?',
    now: 'Ahora',
    schedule: 'Programar',
    dateTime: 'Fecha y hora',
    tooSoon: 'Elige una hora al menos 5 minutos más tarde.',
    pickAccount: 'Elige al menos una cuenta.',
    review: 'Revisa antes de publicar',
    reviewNow: 'Se publica ahora en:',
    reviewScheduled: (date: string) => `Se publica el ${date} en:`,
    irreversible: 'Publicar ahora no se puede deshacer.',
    submitNow: 'Publicar ahora',
    submitScheduled: 'Programar',
    next: 'Continuar',
    doneNow: (n: number) => (n === 1 ? 'Publicado en 1 cuenta.' : `Publicado en ${n} cuentas.`),
    doneScheduled: (n: number) => (n === 1 ? 'Programado en 1 cuenta.' : `Programado en ${n} cuentas.`),
    partial: (failed: number) => (failed === 1 ? '1 cuenta falló.' : `${failed} cuentas fallaron.`),
    chatNow: (title: string, n: number) => `Publiqué «${title}» en ${n === 1 ? '1 cuenta' : `${n} cuentas`}.`,
    chatScheduled: (title: string, date: string) => `Programé «${title}» para el ${date}.`,
  },

  blocked: {
    not_approved: 'Apruébalo para poder publicarlo.',
    video_missing: 'Produce el video del reel para poder publicarlo.',
    no_publish_scope: 'Esta conexión no tiene permiso para publicar. Publica desde Kefy.',
    status: '',
  } as Record<string, string>,

  video: {
    title: 'Video',
    planTitle: 'Plan de producción',
    needsScript: 'Esta story todavía no tiene guion de video.',
    needsScriptHint: 'Kefy escribe un guion corto (hasta 3 planos) que reutiliza la imagen de la story.',
    prepareScript: (cost: string) => `Preparar guion (${cost})`,
    motion: 'Animación',
    motionLevels: {
      none: 'Sin animación',
      key: 'Planos clave',
      full: 'Todos los planos',
    } as Record<string, string>,
    motionHelp: {
      none: 'Fotos con movimiento de cámara.',
      key: 'El gancho y hasta 3 planos clave animados con IA.',
      full: 'Cada plano animado con IA.',
    } as Record<string, string>,
    duration: (s: number) => `${s} s en total`,
    produce: (cost: string) => `Producir video (${cost})`,
    replaceTitle: 'Este contenido ya tiene un video',
    replaceBody: 'Producir de nuevo reemplaza el video actual.',
    producing: 'Produciendo el video…',
    producingHint: 'Puede tardar varios minutos. Puedes seguir conversando: la tarjeta se actualiza sola.',
    progress: (pct: number) => `${pct}% listo`,
    stepStatus: {
      pending: 'En espera',
      running: 'En curso',
      done: 'Listo',
      failed: 'Falló',
      skipped: 'Omitido',
    } as Record<string, string>,
    shot: (n: number) => `Plano ${n}`,
    narrator: 'Narrador',
    failed: 'La producción falló.',
    failedStep: (label: string) => `Falló: ${label}`,
    retry: 'Reintentar',
    ready: 'El video está listo.',
    chatReady: (title: string) => `El video de «${title}» está listo.`,
    tools: {
      generate_image: 'Imagen',
      text_to_speech: 'Voz',
      animate_image: 'Animación',
      lip_sync: 'Labios',
      compose_video: 'Montaje',
    } as Record<string, string>,
  },

  chatApproved: (title: string) => `Aprobé «${title}».`,
};

export type McpAppCopy = typeof es;
export default es;
