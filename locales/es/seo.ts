// Textos de SEO y AEO de las páginas públicas (docs/seo-aeo.md): títulos y
// descripciones para buscadores, migas de pan y las preguntas frecuentes de
// la home. Las respuestas con números son funciones: los precios salen de
// lib/plans.ts y las redes de la lista de canales de la landing.
//
// Las preguntas sobre la plataforma no pueden prometer anuncios (no hay UI);
// la del servicio gestionado sí, porque los lleva el equipo (`service: true`).
// Lo vigila tests/unit/lib/seo.test.ts.

/** Datos que usan las respuestas de la FAQ de la home. */
export interface HomeFaqContext {
  service: string;
  platform: string;
  channelCount: string;
  channels: string;
  niches: string;
}

export interface HomeFaq { q: string; a: (c: HomeFaqContext) => string; service?: true }

const homeFaq: HomeFaq[] = [
  {
    q: '¿Qué es Kefy?',
    a: () => 'Kefy es una plataforma de marketing en redes sociales con inteligencia artificial para negocios que no tienen equipo de marketing. Aprende tu marca desde tu web, crea posts, carruseles, reels y stories, y los publica en tus redes. Tú los apruebas en un toque o activas el piloto automático.',
  },
  {
    q: '¿Cuánto cuesta Kefy?',
    a: (c) => `La plataforma cuesta desde USD ${c.platform} al mes y toda cuenta empieza con 30 días gratis, sin tarjeta; no tiene contrato y la cancelas cuando quieras. Si prefieres que nuestro equipo lleve tus redes, el servicio cuesta USD ${c.service} al mes.`,
  },
  {
    q: '¿En qué redes sociales publica Kefy?',
    a: (c) => `En ${c.channelCount} redes: ${c.channels}. Conectas tus cuentas una vez y cada pieza se adapta al formato de cada red.`,
  },
  {
    q: '¿Kefy publica solo o tengo que aprobar cada publicación?',
    a: () => 'Tú eliges. Puedes revisar y aprobar cada publicación antes de que salga, o activar el piloto automático: Kefy crea y publica según los temas, redes, días y horas que definas.',
  },
  {
    q: '¿Qué tipo de contenido crea Kefy?',
    a: () => 'Posts, carruseles, reels y stories. El texto, la imagen y el video se crean con IA a partir de tus colores, tu tono y lo que vendes, en español o en inglés.',
  },
  {
    q: '¿Pueden llevar las redes de mi negocio por mí?',
    service: true,
    a: (c) => `Sí. Con el servicio de redes (USD ${c.service} al mes) nuestro equipo publica todas las semanas, lleva tus anuncios y responde mensajes y comentarios, también de noche y los fines de semana. Partimos con una revisión de tus redes, sin costo.`,
  },
  {
    q: '¿Para qué tipo de negocios sirve Kefy?',
    a: (c) => `Para negocios sin equipo de marketing y para agencias que atienden varias marcas. Tenemos una página con ejemplos para cada rubro: ${c.niches}.`,
  },
];

const es = {
  /** Datos estructurados de la home (SoftwareApplication). */
  home: {
    appDescription: 'Kefy crea publicaciones con tu marca (posts, carruseles, reels y stories) y las publica en tus redes sociales. Tú las apruebas o activas el piloto automático.',
    offersDescription: (from: string, trialDays: string) => `Planes mensuales desde USD ${from}. Todas las cuentas empiezan con ${trialDays} días gratis del plan Starter, sin tarjeta.`,
    serviceName: 'Servicio de redes sociales gestionado',
    serviceDescription: 'El equipo de Kefy publica todas las semanas con la imagen de tu negocio, lleva tus anuncios y responde mensajes y comentarios.',
    nichesName: 'Kefy por rubro',
  },
  pages: {
    pricing: {
      title: 'Precios de Kefy: planes desde USD 49 al mes | Kefy',
      description: 'Planes de Kefy desde USD 49 al mes, con 30 días gratis y sin tarjeta. Compara créditos, marcas y redes de Starter, Pro y Business. Sin contrato.',
    },
    about: {
      title: 'Sobre Kefy: quiénes somos y por qué lo construimos | Kefy',
      description: 'Kefy nació de un problema real: hacer marketing en redes para nuestros propios negocios era caro y lento. Conoce la historia y al equipo detrás.',
    },
    blog: {
      title: 'Blog de Kefy: marketing en redes sociales para negocios | Kefy',
      description: 'Guías prácticas de marketing, contenido y redes sociales para negocios que no tienen un equipo de marketing dedicado.',
    },
    terms: {
      title: 'Términos de servicio | Kefy',
      description: 'Las condiciones para usar Kefy: cuentas, uso aceptable, propiedad del contenido que generas y limitación de responsabilidad.',
    },
    privacy: {
      title: 'Política de privacidad | Kefy',
      description: 'Qué datos recoge Kefy, para qué los usa, con quién los comparte y cómo pedir acceso, corrección o eliminación.',
    },
    cookies: {
      title: 'Política de cookies | Kefy',
      description: 'Qué cookies usa Kefy (esenciales, de preferencias y de análisis) y cómo gestionarlas desde tu navegador.',
    },
  },
  /** Títulos de las secciones de /llms.txt (lib/llms.ts). */
  llms: {
    offers: 'Formas de trabajar con Kefy',
    plans: (list: string) => `Planes: ${list}.`,
    niches: 'Páginas por rubro',
    faq: 'Preguntas frecuentes',
    pages: 'Más páginas',
    updated: 'Actualizado',
    home: 'Inicio',
  },
  breadcrumb: {
    label: 'Migas de pan',
    home: 'Inicio',
    niches: 'Rubros',
    pricing: 'Precios',
    blog: 'Blog',
  },
  faq: {
    tag: 'Preguntas frecuentes',
    h2: 'Lo que más nos preguntan',
    items: homeFaq,
  },
};

export default es;
export type SeoCopy = typeof es;
