// Textos compartidos por todo el dashboard: navegación, acciones genéricas,
// estados de contenido y errores comunes. Los de cada pantalla viven en su
// propio archivo de locales/es/dashboard/.
//
// locales/en/dashboard/common.ts se tipa con `typeof es`: si falta o sobra una
// clave en inglés, no compila. tests/unit/locales/parity.test.ts además compara
// la forma de todos los locales y que ningún texto quede vacío en un idioma.

const es = {
  nav: {
    home: 'Inicio',
    brand: 'Mi marca',
    content: 'Contenido',
    inbox: 'Inbox',
    automations: 'Automatizar',
    settings: 'Ajustes',
    profile: 'Perfil',
    create: 'Crear contenido',
    mainNav: 'Navegación principal',
    collapse: 'Colapsar menú',
    expand: 'Expandir menú',
    unread: (n: number) => (n === 1 ? '1 mensaje o comentario sin responder' : `${n} mensajes o comentarios sin responder`),
    language: 'Idioma',
    themeToLight: 'Cambiar a tema claro',
    themeToDark: 'Cambiar a tema oscuro',
    switchBrand: (name: string) => `Cambiar de marca (actual: ${name})`,
    account: 'Mi cuenta',
    logout: 'Cerrar sesión',
    privacy: 'Privacidad',
    terms: 'Términos',
    skipToContent: 'Saltar al contenido',
  },
  // Aviso de Mi marca mientras al Brand Kit le faltan datos (brand/layout.tsx).
  brandSetup: {
    title: (percent: number) => `Tu marca está al ${percent} %.`,
    body: 'Completarla ayuda a que lo que escribe Kefy suene a ti.',
    cta: 'Completar mi marca',
  },
  sections: {
    content: { aria: 'Secciones de Contenido', create: 'Mis contenidos', calendar: 'Calendario', library: 'Ideas' },
    brand: { aria: 'Secciones de Mi marca', identity: 'Identidad', market: 'Mercado', strategy: 'Estrategia' },
    automations: { aria: 'Secciones de Automatizar', autopilot: 'Piloto automático', engagement: 'Respuestas', leads: 'Leads' },
  },
  actions: {
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado',
    cancel: 'Cancelar',
    close: 'Cerrar',
    delete: 'Eliminar',
    deleting: 'Eliminando…',
    confirm: 'Confirmar',
    retry: 'Reintentar',
    back: 'Volver',
    edit: 'Editar',
    continue: 'Continuar',
    loading: 'Cargando…',
    later: 'Más tarde',
    remove: (item: string) => `Quitar ${item}`,
    add: 'Añadir',
  },
  errors: {
    generic: 'Algo salió mal. Inténtalo de nuevo.',
    network: 'Error de red. Revisa tu conexión e inténtalo de nuevo.',
    load: 'No se pudo cargar. Inténtalo de nuevo.',
  },
  status: {
    draft: 'Borrador',
    approved: 'Aprobado',
    scheduled: 'Programado',
    published: 'Publicado',
    archived: 'Archivado',
    pending: 'Pendiente',
    failed: 'Falló',
    cancelled: 'Cancelado',
  },
  confirm: {
    deleteTitle: '¿Eliminar?',
    irreversible: 'Esta acción no se puede deshacer.',
  },
  chips: {
    placeholder: 'Escribe y pulsa Enter…',
    suggestions: 'Sugerencias',
    loadSuggestions: 'Sugerir con IA (1 crédito)',
    loadingSuggestions: 'Buscando sugerencias…',
    limit: (max: number) => `Máximo ${max}`,
  },
};

export default es;
export type DashboardCommonCopy = typeof es;
