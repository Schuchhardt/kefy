// Ajustes (app/[lang]/dashboard/settings/page.tsx) y su sección de API keys
// (components/dashboard/settings/ApiKeysSection.tsx).
//
// Los precios, topes y features de cada plan NO van aquí: salen de
// lib/plans.ts (PLAN_PRICES_USD, planHighlights, planIncluded, planName) y de
// locales/*/plans.ts. Antes este archivo tenía su propia tabla —Starter a $19,
// Pro a $69, «Marcas ilimitadas», «Modo autopilot» como exclusivo— que no
// coincidía ni con Stripe ni con la landing.
//
// locales/en/dashboard/settings.ts se tipa con `SettingsCopy`: si falta o sobra
// una clave en inglés, no compila.

const es = {
  title: 'Ajustes',
  subtitle: 'Tu cuenta, tu organización, el plan, las redes conectadas y las integraciones.',
  /** Nombre accesible del índice de secciones. */
  indexLabel: 'Secciones de ajustes',

  sections: {
    profile: 'Perfil',
    org: 'Organización',
    billing: 'Plan y facturación',
    social: 'Cuentas sociales',
    team: 'Equipo',
    leadScoring: 'Scoring de leads',
  },

  // ─── Perfil: el nombre se edita solo en /dashboard/profile ────────────────
  profile: {
    subtitle: 'Tu nombre y tu contraseña se cambian en tu perfil.',
    nameLabel: 'Nombre',
    emailLabel: 'Correo electrónico',
    noName: 'Sin nombre',
    edit: 'Editar en tu perfil',
  },

  // ─── Organización ─────────────────────────────────────────────────────────
  org: {
    subtitle: 'El nombre que ve tu equipo y que aparece en las invitaciones.',
    nameLabel: 'Nombre de la organización',
    saved: 'Nombre guardado',
    saveError: 'No se pudo guardar el nombre de la organización. Inténtalo de nuevo.',
    readOnly: 'Solo el dueño o un administrador pueden cambiar el nombre de la organización.',
  },

  // ─── Plan y facturación ───────────────────────────────────────────────────
  billing: {
    current: 'Plan actual',
    includedTitle: 'Todos los planes incluyen',
    upgrade: (plan: string) => `Mejorar a ${plan}`,
    change: (plan: string) => `Cambiar a ${plan}`,
    subscribe: (plan: string) => `Suscribirme a ${plan}`,
    manage: 'Gestionar suscripción',
    redirecting: 'Redirigiendo a Stripe…',
    success: 'Plan actualizado. ¡Gracias por suscribirte!',
    canceled: 'El proceso de pago fue cancelado.',
    checkoutError: 'No se pudo iniciar el proceso de pago. Inténtalo de nuevo.',
    portalError: 'No se pudo abrir el portal de facturación. Inténtalo de nuevo.',
    noCustomer: 'Todavía no tienes una suscripción de pago. Elige un plan para suscribirte.',
    onlyManagers: 'Solo el dueño o un administrador pueden cambiar el plan.',
    status: {
      trial: (days: number) => (days <= 1
        ? 'Tu mes gratis termina hoy. Elige un plan para no interrumpir tu contenido.'
        : `Estás en tu mes gratis: te quedan ${days} días. Elige un plan antes de que termine para no interrumpir tu contenido.`),
      trialEnded: 'Tu mes gratis terminó. Todo lo que creaste sigue aquí: elige un plan para volver a generar y publicar.',
      paymentFailed: 'No pudimos procesar tu último pago. Actualiza tu método de pago en «Gestionar suscripción».',
      inactive: 'Tu suscripción no está activa. Elige un plan para volver a generar y publicar.',
    },
  },

  // ─── Scoring de leads ─────────────────────────────────────────────────────
  // Las claves (comment, dm, tibio…) son las de kefy_lead_scoring_config y no
  // se traducen: solo cambia lo que se muestra.
  leadScoring: {
    subtitle: 'Cada interacción suma puntos a un lead. Cuando su puntaje llega al mínimo de una etapa, pasa a esa etapa.',
    pointsTitle: 'Puntos por tipo de interacción',
    thresholdsTitle: 'Puntaje mínimo de cada etapa',
    points: (n: number) => (n === 1 ? '1 punto' : `${n} puntos`),
    interactions: {
      comment: 'Comentario',
      review: 'Reseña',
      dm: 'Mensaje directo',
      mention: 'Mención',
      follow: 'Nuevo seguidor',
      share: 'Contenido compartido',
      click: 'Clic en un enlace',
      manual: 'Interacción manual',
    } as Record<string, string>,
    stages: {
      tibio: 'Tibio',
      caliente: 'Caliente',
      contactado: 'Contactado',
      convertido: 'Convertido',
    } as Record<string, string>,
    save: 'Guardar scoring',
    saved: 'Scoring guardado',
    saveError: 'No se pudo guardar el scoring. Inténtalo de nuevo.',
    readOnly: 'Solo el dueño o un administrador pueden cambiar el scoring.',
  },

  // ─── API keys y MCP (components/dashboard/settings/ApiKeysSection.tsx) ────
  apiKeys: {
    /** Locale BCP 47 para las fechas de las keys. */
    dateLocale: 'es-ES',
    sectionTitle: 'API y MCP',
    intro: 'Conecta Kefy con Claude, Cursor u otros agentes y proyectos. Cada key actúa con el rol actual de quien la creó y solo con los permisos que elijas.',
    create: 'Crear API key',
    loading: 'Cargando…',
    loadError: 'No pudimos cargar las API keys.',
    retry: 'Reintentar',
    empty: 'Aún no hay API keys. Crea una para conectar un agente o proyecto externo.',
    limitNote: (n: number) => `Máximo ${n} keys activas por organización.`,
    allBrands: 'Todas las marcas',
    unknownBrand: 'Marca archivada',
    createdBy: (name: string) => `Creada por ${name}`,
    lastUsed: (when: string) => `Último uso ${when}`,
    neverUsed: 'Nunca usada',
    expiresOn: (date: string) => `Expira el ${date}`,
    expiredOn: (date: string) => `Expiró el ${date}`,
    noExpiry: 'Sin expiración',
    statusRevoked: 'Revocada',
    statusExpired: 'Expirada',
    showInactive: (n: number) => `Ver revocadas y expiradas (${n})`,
    hideInactive: 'Ocultar revocadas y expiradas',
    // Revocar
    revoke: 'Revocar',
    revokeTitle: 'Revocar API key',
    revokeBody: (name: string) => `«${name}» dejará de funcionar de inmediato y las integraciones que la usen empezarán a recibir errores 401. No se puede deshacer.`,
    revokeConfirm: 'Sí, revocar',
    revoking: 'Revocando…',
    revokeError: 'No se pudo revocar la key.',
    cancel: 'Cancelar',
    close: 'Cerrar',
    // Crear
    createTitle: 'Nueva API key',
    nameLabel: 'Nombre',
    namePlaceholder: 'Ej. Claude Code — marketing',
    scopesLabel: 'Permisos',
    scopes: {
      read: { label: 'Lectura', hint: 'Ver contenido, calendario, analytics, bandeja, marca y estrategia.' },
      write: { label: 'Escritura', hint: 'Crear y editar borradores y generar con IA (gasta créditos).' },
      publish: { label: 'Publicación', hint: 'Publicar y programar en redes y responder DMs y comentarios.' },
    },
    publishWarning: 'Puede publicar y responder en redes sin confirmación humana. No la uses en agentes que lean mensajes.',
    scopesRequired: 'Elige al menos un permiso.',
    brandLabel: 'Marca',
    brandHint: 'Ata la key a una marca si la integración solo trabaja con una.',
    expiryLabel: 'Expiración',
    expiryNever: 'Nunca',
    expiryDays: (n: number) => `${n} días`,
    submit: 'Crear key',
    creating: 'Creando…',
    createError: 'No se pudo crear la key.',
    invalidInput: 'Revisa los datos del formulario.',
    brandNotFound: 'Esa marca ya no existe o fue archivada. Elige otra.',
    keyLimitReached: (n: number) => `Llegaste al máximo de ${n} keys activas. Revoca una para crear otra.`,
    // Secreto (se muestra una sola vez)
    secretTitle: 'Tu nueva API key',
    secretWarning: 'Cópiala y guárdala en un lugar seguro. No la volverás a ver.',
    copy: 'Copiar',
    copied: 'Copiado',
    copyFailed: 'No se pudo copiar',
    done: 'Ya la guardé',
    // Conexión
    connectTitle: 'Conectar vía MCP',
    connectIntro: 'Usa esta URL con la cabecera «Authorization: Bearer» y tu key. En los ejemplos, reemplaza kefy_sk_... por la key que creaste.',
    mcpUrlLabel: 'URL del servidor MCP',
    snippetsLabel: 'Ejemplos de configuración por cliente',
    snippetHints: {
      claudeCode: 'Ejecuta en tu terminal:',
      cursor: 'Añade a ~/.cursor/mcp.json:',
      claudeDesktop: 'Añade a claude_desktop_config.json (usa el puente mcp-remote):',
      curl: 'Lista las herramientas disponibles para la key (API REST):',
    },
  },
};

export default es;
export type SettingsCopy = typeof es;
