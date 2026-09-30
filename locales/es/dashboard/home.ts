// Home del dashboard (app/[lang]/dashboard/page.tsx).
//
// Antes este archivo no lo usaba nadie y anunciaba un «Plan gratuito activo»
// que no existe; los textos del home estaban dentro de la página. Ahora el
// home tiene: aviso de plan arriba, una lista de bienvenida con estado real
// (en vez del modal «Bienvenido» que se reabría en cada visita), métricas,
// contenido reciente y accesos rápidos.

const es = {
  loading: 'Cargando…',
  hello: (name: string) => `Hola, ${name}`,
  helloAnonymous: 'Hola',
  intro: (org: string) => `Kefy crea las publicaciones de ${org} y tú decides cuáles salen.`,
  introNoOrg: 'Kefy crea tus publicaciones y tú decides cuáles salen.',
  create: 'Crear contenido',

  plan: {
    trialActive: (n: number) => (n === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${n} días de prueba`),
    trialActiveDesc: 'Estás usando Starter gratis. Elige un plan antes de que termine para no interrumpir tu contenido.',
    trialLastDay: 'Tu prueba termina hoy',
    trialEnded: 'Tu mes gratis terminó',
    trialEndedDesc: 'Todo lo que creaste sigue aquí. Elige un plan para volver a generar y publicar.',
    paymentFailed: 'No pudimos procesar tu pago',
    paymentFailedDesc: 'Actualiza tu método de pago para seguir creando contenido.',
    creditsLow: (n: number, total: number) => `Te quedan ${n} de ${total} créditos IA`,
    creditsLowDesc: 'Cuando se acaben, la generación se pausa hasta tu próximo ciclo.',
    creditsOut: (total: number) => `Usaste tus ${total} créditos IA del mes`,
    creditsOutDesc: 'Mejora tu plan para seguir generando contenido este mes.',
    viewPlans: 'Ver planes',
  },

  welcome: {
    title: 'Primeros pasos',
    progress: (done: number, total: number) => `${done} de ${total} listos`,
    hide: 'Ocultar',
    hideLabel: 'Ocultar la lista de primeros pasos',
    done: 'Hecho',
    pending: 'Pendiente',
    steps: {
      posts: {
        title: 'Crea tus primeros posts',
        desc: 'Pega tu web o describe tu negocio y Kefy escribe 3 posts con tu marca.',
        cta: 'Crear mis 3 posts',
      },
      brand: {
        title: 'Completa tu marca',
        desc: 'Tono, colores, público… para que lo que escribe Kefy suene a ti.',
        descPercent: (n: number) => `Está al ${n} %. Tono, colores, público… para que lo que escribe Kefy suene a ti.`,
        cta: 'Completar mi marca',
      },
      social: {
        title: 'Conecta una red',
        desc: 'Instagram, LinkedIn, TikTok y más, para publicar desde Kefy.',
        cta: 'Conectar redes',
      },
      publish: {
        title: 'Publica o programa un post',
        desc: 'Elige un borrador, revísalo y publícalo o déjalo programado.',
        cta: 'Ver mis contenidos',
      },
    },
  },

  metrics: {
    title: 'Resumen (últimos 30 días)',
    sync: 'Sincronizar métricas',
    syncing: 'Sincronizando…',
    impressions: 'Impresiones',
    reach: 'Alcance',
    likes: 'Me gusta',
    comments: 'Comentarios',
    shares: 'Compartidos',
    clicks: 'Clics',
    noAccounts: 'Conecta una red para ver tus métricas.',
    connect: 'Conectar redes',
  },

  recent: {
    title: 'Contenido reciente',
    all: 'Ver todo',
    empty: 'Todavía no tienes contenido.',
    perf: (impressions: string, likes: string) => `${impressions} impresiones · ${likes} me gusta`,
    video: 'Video',
  },

  top: {
    title: 'Mejor rendimiento',
    perf: (impressions: string, likes: string, rate: string) =>
      `${impressions} impresiones · ${likes} me gusta · ${rate} de interacción`,
  },

  quick: {
    title: 'Accesos rápidos',
    brand: { label: 'Mi marca', desc: 'Identidad, mercado y estrategia' },
    content: { label: 'Crear contenido', desc: 'Posts, carruseles, reels y stories con IA' },
    inbox: { label: 'Inbox', desc: 'DMs y comentarios de tus redes' },
    automations: { label: 'Automatizar', desc: 'Piloto automático y respuestas' },
  },
};

export default es;
export type HomeCopy = typeof es;
