export interface NavLink { id: string; label: string; }
export interface HeroStat { big: string; lbl: string; }
export interface DemoOutput { channel: string; meta: string; body: string; }
export interface Pain { num: string; t: string; d: string; }
export interface StatCard { v: number; pre?: string; suf?: string; d: string; warm?: boolean; }
export interface Step { n: string; ic: string; t: string; d: string; }
export interface MultOutput { k: string; sub: string; }
export interface BrandBullet { ic: string; t: string; }
export interface KillerPoint { k: string; d: string; }
export interface DashStat { lbl: string; v: string; d: string; }
export interface DashPost { ic: string; text: string; eng: string; winner: boolean; boost: string; }
export interface ApBullet { ic: string; t: string; }
export interface CalDay { day: string; items: { ic: string; t: string }[] }
export interface FeatureItem { ic: string; t: string; d: string; }
export interface WhoSegment { ic: string; t: string; d: string; }
export interface PlanFeature { dim?: boolean; t: string; }
export interface Plan { name: string; price: string; per: string; tagline: string; features: (string | PlanFeature)[]; cta: string; featured?: boolean; badge?: string; }
export interface Testimonial { q: string; name: string; role: string; flag: string; avatar: string; }

export interface KefyCopy {
  nav: { links: NavLink[]; signin: string; primary: string; };
  hero: { tag: string; h1: string[]; h1em: string; sub: string; cta1: string; cta2: string; stats: HeroStat[]; };
  demo: {
    contextLbl: string; contextProduct: string; contextDesc: string;
    channelsLbl: string; goalLbl: string; goalK: string; goalV: string;
    audienceK: string; audienceV: string; url: string;
    outputs: { linkedin: DemoOutput; meta: DemoOutput; x: DemoOutput };
  };
  problem: { tag: string; h2: string; intro: string; pains: Pain[]; stats: StatCard[]; };
  how: { tag: string; h2: string; intro: string; steps: Step[]; closer: string[]; };
  mult: { tag: string; h2: string[]; sub: string; bullets: { ic: string; t: string }[]; inLbl: string; inV: string; outLbl: string; outputs: MultOutput[]; };
  brand: { tag: string; h2: string[]; sub: string; bullets: BrandBullet[]; kit: { palette: string; type: string; logo: string; tone: string; toneV: string; typeV: string }; };
  killer: { tag: string; h2: string[]; sub: string; points: KillerPoint[]; dash: { title: string; range: string; stats: DashStat[]; posts: DashPost[] }; };
  autopilot: { tag: string; h2: string[]; sub: string; bullets: ApBullet[]; closer: string; togglePilot: string; toggleManual: string; schedule: CalDay[]; };
  features: { tag: string; h2: string; items: FeatureItem[]; };
  who: { tag: string; h2: string[]; segments: WhoSegment[]; };
  channels: { h3: string[]; sub: string; items: string[]; };
  cmp: { tag: string; h2: string; cols: string[]; rows: (string | string[])[]; partial: string; };
  lang: { h2: string[]; em: string; sub: string; more: string; };
  pricing: { tag: string; h2: string; plans: Plan[]; closer: string; };
  testi: { tag: string; h2: string; items: Testimonial[]; };
  final: { tag: string; h2: string; sub: string; cta: string; note: string; };
  footer: { tagline: string; cols: { h: string; items: string[] }[]; origin: string; copy: string; };
}

const es: KefyCopy = {
  nav: {
    links: [
      { id: 'how', label: 'Cómo funciona' },
      { id: 'features', label: 'Funcionalidades' },
      { id: 'pricing', label: 'Precios' },
      { id: 'blog', label: 'Blog' },
    ],
    signin: 'Iniciar sesión',
    primary: 'Empieza gratis',
  },
  hero: {
    tag: 'Tu equipo de marketing en una sola plataforma',
    h1: ['El equipo de marketing', 'que tu negocio necesita.'],
    h1em: 'En piloto automático.',
    sub: 'Kefy escribe tu contenido, diseña tus imágenes, multiplica lo que ya tienes, publica en el momento justo y maneja tus campañas. Todo desde un solo lugar. Sin contratar a nadie.',
    cta1: 'Empieza gratis',
    cta2: 'Ver cómo funciona',
    stats: [
      { big: 'Texto · Imagen · Video · Ads', lbl: 'todo en uno' },
      { big: '6', lbl: 'canales nativos' },
      { big: 'Auto', lbl: 'modo piloto opcional' },
    ],
  },
  demo: {
    contextLbl: 'Identidad de marca',
    contextProduct: 'Trazo Studio',
    contextDesc: 'Tienda de ropa slow-fashion · Audiencia: mujeres 25–40, LATAM · Paleta arena + lima · Tono cercano, sin tecnicismos · Marca: minimalista, editorial',
    channelsLbl: 'Canal activo',
    goalLbl: 'Esta semana',
    goalK: 'Modo',
    goalV: 'Piloto automático',
    audienceK: 'Calendario',
    audienceV: '12 piezas / semana',
    url: 'app.kefy.io / dashboard',
    outputs: {
      linkedin: {
        channel: 'LinkedIn',
        meta: '· post · 1,247 caracteres',
        body: 'Llevo tres años manejando una tienda de ropa sola. Tres.\n\nPublicaba cuando me acordaba — una vez por semana en el mejor caso. Cero LinkedIn. Cero ads.\n\nDesde que activé @Kefy en modo automático:\n→ 12 piezas por semana en 4 redes\n→ Las ventas por Instagram subieron 60%\n\nLo único que hago ahora es revisar y aprobar. →',
      },
      meta: {
        channel: 'Meta Ads',
        meta: '· ad copy · 4 variantes',
        body: 'Texto principal:\nNo tienes equipo de marketing. Tienes Kefy.\n\nTitular:\nTu marketing en piloto automático.\n\nCTA: Registrarse',
      },
      x: {
        channel: 'X',
        meta: '· thread · 5 tweets',
        body: 'cosas que hacía mal en mi negocio:\n\n— publicaba 1 vez por semana\n— mi instagram tenía 3 estilos distintos\n— nunca corrí un ad\n\nhoy kefy hace todo eso. yo solo apruebo.\n\n1/5 →',
      },
    },
  },
  problem: {
    tag: 'El problema',
    h2: 'Tienes un negocio. No tienes un equipo de marketing.',
    intro: 'Las startups, pymes y tiendas online enfrentan el mismo problema: contratar un equipo de marketing cuesta entre $5.000 y $15.000 al mes.',
    pains: [
      { num: '01', t: 'Publicas cuando te acuerdas', d: 'Tu Instagram tiene posts de hace tres semanas. Tu Facebook lleva un mes en silencio.' },
      { num: '02', t: 'Tu contenido se queda en una sola pieza', d: 'Grabaste un video, escribiste un post de blog. Y se quedó ahí. Cuando podría haberse multiplicado en 20 piezas.' },
      { num: '03', t: 'Las campañas pagadas te dan miedo', d: 'Sabes que deberías pautar en Meta. Pero abrir Ads Manager es entrar a otra dimensión.' },
    ],
    stats: [
      { v: 8.5, pre: '$', suf: 'k/mes', d: 'Costo promedio de un equipo de marketing junior (3 personas) en LATAM', warm: true },
      { v: 2.7, d: 'Posts promedio por semana de una pyme sin equipo dedicado' },
      { v: 89, suf: '%', d: 'Negocios pequeños que nunca han hecho una campaña pagada de ads' },
    ],
  },
  how: {
    tag: 'Cómo funciona',
    h2: 'Cinco pasos. Cero fricción.',
    intro: 'Configúralo una vez. Decide qué tan automático quieres que sea.',
    steps: [
      { n: '01', ic: '🧠', t: 'Aprende tu negocio', d: 'Sube tu logo, paleta, productos y tono. Kefy construye tu identidad de marca.' },
      { n: '02', ic: '✍️', t: 'Crea contenido nuevo', d: 'Texto, imagen, video y diseño. Para promociones, lanzamientos o autoridad.' },
      { n: '03', ic: '🔁', t: 'Multiplica lo que ya tienes', d: 'Sube un video, un blog o una foto. Kefy lo convierte en 10 piezas para cada canal.' },
      { n: '04', ic: '📅', t: 'Publica en el momento correcto', d: 'Conecta tus redes. Kefy publica cuando tu audiencia está activa.' },
      { n: '05', ic: '🎯', t: 'Mide y promociona con ads', d: 'Cada post tiene métricas. Kefy convierte los ganadores en anuncios pagados en Meta.' },
    ],
    closer: ['O activa el modo', 'piloto automático', 'y deja que Kefy haga todo el ciclo por ti.'],
  },
  mult: {
    tag: 'Multiplicación de contenido',
    h2: ['Una pieza. Veinte versiones.', 'Cero esfuerzo.'],
    sub: 'Sube lo que ya creaste y Kefy lo transforma en todas las piezas que tu marketing necesita.',
    bullets: [
      { ic: '🎬', t: 'De video largo a reels y shorts' },
      { ic: '📸', t: 'De foto de producto a posts, ads y banners' },
      { ic: '📄', t: 'De blog post a hilos, emails y carruseles' },
      { ic: '🎙️', t: 'De podcast a clips, citas y posts' },
    ],
    inLbl: 'Input',
    inV: 'video de 60s · producto',
    outLbl: 'Outputs',
    outputs: [
      { k: 'Reel 15s', sub: 'Instagram · TikTok' },
      { k: 'Carrusel 6 slides', sub: 'Instagram · LinkedIn' },
      { k: 'Post LinkedIn', sub: '1,200 caracteres' },
      { k: 'Email', sub: '312 palabras' },
      { k: 'Story 9:16', sub: 'Instagram · Facebook' },
      { k: 'Thread X', sub: '5 tweets' },
      { k: 'Ad copy 4×', sub: 'Meta · 4 variantes' },
      { k: 'Banner 16:9', sub: 'Web · email header' },
      { k: 'Descripción producto', sub: 'Tienda · 180 palabras' },
      { k: 'Miniatura YouTube', sub: '1280×720' },
    ],
  },
  brand: {
    tag: 'Identidad de marca',
    h2: ['Tu marca, aplicada a', 'cada pieza', 'que sale al mundo.'],
    sub: 'Kefy aprende tu paleta, tipografía, tono y estilo visual y aplica esa identidad a todo.',
    bullets: [
      { ic: '🎨', t: 'Brand kit completo (colores, tipografías, logos)' },
      { ic: '🗣️', t: 'Tono de voz configurable y consistente' },
      { ic: '📐', t: 'Plantillas adaptadas a tu identidad' },
      { ic: '✨', t: '¿No tienes marca todavía? Kefy te ayuda a construirla' },
    ],
    kit: {
      palette: 'Paleta',
      type: 'Tipografía',
      logo: 'Logo',
      tone: 'Tono',
      toneV: 'Cercano · directo · sin tecnicismos',
      typeV: 'Syne · DM Sans',
    },
  },
  killer: {
    tag: 'Métricas y campañas',
    h2: ['Mide qué funciona.', 'Promociona lo mejor.', 'Sin abrir otra pestaña.'],
    sub: 'Todas las métricas de tus redes en un solo dashboard. Cuando un post conecta, Kefy te avisa y te ofrece convertirlo en ad pagado.',
    points: [
      { k: 'Dashboard unificado', d: 'Engagement, alcance, conversiones de todas tus redes en una vista.' },
      { k: 'Detección de ganadores', d: 'Kefy identifica qué tipo de contenido funciona mejor para tu audiencia.' },
      { k: 'Pauta con un clic', d: 'Convierte cualquier post en un anuncio pagado sin tocar Meta Ads Manager.' },
    ],
    dash: {
      title: 'Performance · últimos 30 días',
      range: 'Últimos 30 días',
      stats: [
        { lbl: 'Alcance', v: '184.2k', d: '+42%' },
        { lbl: 'Engagement', v: '6.8%', d: '+1.4 pts' },
        { lbl: 'Clicks', v: '12.4k', d: '+28%' },
        { lbl: 'Ventas IG', v: '+60%', d: 'vs. mes ant.' },
      ],
      posts: [
        { ic: '📷', text: 'Carrusel nueva colección "Invierno tranquilo" — 8 productos en estilo editorial', eng: '8.4%', winner: true, boost: 'Promocionar · $20/día' },
        { ic: 'in', text: 'Llevo tres años manejando una tienda de ropa sola…', eng: '6.1%', winner: true, boost: 'Promocionar · $15/día' },
        { ic: '𝕏', text: 'cosas que hacía mal en mi negocio…', eng: '3.2%', winner: false, boost: 'Analizar' },
      ],
    },
  },
  autopilot: {
    tag: 'Piloto automático',
    h2: ['Activa el modo automático.', 'Olvídate del marketing.'],
    sub: 'Configura tu calendario, define tu presupuesto y deja que Kefy haga el resto.',
    bullets: [
      { ic: '🤖', t: 'Genera contenido nuevo cada semana' },
      { ic: '📅', t: 'Publica automáticamente en horarios óptimos' },
      { ic: '🎯', t: 'Promociona los posts ganadores dentro de tu presupuesto' },
    ],
    closer: 'Tú revisas. Tú apruebas si quieres. O dejas que vuele solo.',
    togglePilot: 'Piloto automático',
    toggleManual: 'Manual',
    schedule: [
      { day: 'Lun', items: [{ ic: '📷', t: 'Post IG · 09:00' }, { ic: '🎬', t: 'Reel TikTok · 19:00' }] },
      { day: 'Mar', items: [{ ic: 'in', t: 'Post LinkedIn · 08:30' }] },
      { day: 'Mié', items: [{ ic: '📷', t: 'Carrusel IG · 18:00' }, { ic: '✉', t: 'Email · 11:00' }] },
      { day: 'Jue', items: [{ ic: '𝕏', t: 'Thread X · 14:00' }, { ic: '🎬', t: 'Story IG · 20:00' }] },
      { day: 'Vie', items: [{ ic: '📷', t: 'Post FB · 10:00' }, { ic: '🎯', t: 'Boost auto · $20' }] },
      { day: 'Sáb', items: [{ ic: '🎬', t: 'Reel IG · 12:00' }] },
      { day: 'Dom', items: [{ ic: '📊', t: 'Reporte semanal' }] },
    ],
  },
  features: {
    tag: 'Todo lo que incluye',
    h2: 'Un equipo completo. Una sola suscripción.',
    items: [
      { ic: '🧠', t: 'Identidad de marca', d: 'Crea o aplica tu marca a cada pieza.' },
      { ic: '✍️', t: 'Generación de texto', d: 'Posts, emails, anuncios, descripciones.' },
      { ic: '🎨', t: 'Diseño e imágenes', d: 'Imágenes, carruseles, banners, plantillas.' },
      { ic: '🎬', t: 'Video y reels', d: 'Cortos de 15–60s con voz e identidad propia.' },
      { ic: '📅', t: 'Programación', d: 'Instagram, Facebook, LinkedIn, TikTok, X, email.' },
      { ic: '🎯', t: 'Campañas pagadas', d: 'Pauta en Meta sin salir de Kefy.' },
    ],
  },
  who: {
    tag: '¿Para quién?',
    h2: ['Si tu negocio', 'necesita marketing', 'pero no tiene equipo, Kefy es para ti.'],
    segments: [
      { ic: '🛒', t: 'Tiendas online y e-commerce', d: 'Lanza productos, crea promociones, multiplica tus fotos en posts y ads.' },
      { ic: '🏪', t: 'Pymes con productos físicos o servicios', d: 'Construye autoridad local y automatiza tus redes sin perder personalidad.' },
      { ic: '🚀', t: 'Startups en crecimiento', d: 'Construye marca y genera demanda sin esperar tener un equipo completo.' },
      { ic: '💼', t: 'Empresas medianas', d: 'Multiplica el output de tu equipo actual. Lo que hacían 5 personas, con 2 y Kefy.' },
    ],
  },
  channels: {
    h3: ['Publica nativamente en', 'todas tus redes.'],
    sub: 'Conecta tus cuentas una vez. Kefy adapta cada pieza al formato de cada plataforma.',
    items: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'X', 'YouTube Shorts', 'Email', 'Meta Ads'],
  },
  cmp: {
    tag: 'Por qué Kefy',
    h2: 'Cada herramienta hace una cosa. Kefy las hace todas.',
    cols: ['Kefy', 'Buffer / Hootsuite', 'Canva', 'Copy.ai', 'Agencia'],
    rows: [
      ['Genera texto con contexto de tu marca', 'yes', 'no', 'no', 'partial', 'yes'],
      ['Crea imágenes y diseños con tu identidad', 'yes', 'no', 'partial', 'no', 'yes'],
      ['Genera videos cortos', 'yes', 'no', 'partial', 'no', 'yes'],
      ['Multiplica tu contenido existente', 'yes', 'no', 'no', 'no', 'partial'],
      ['Programa y publica en todas las redes', 'yes', 'yes', 'no', 'no', 'partial'],
      ['Analytics unificadas', 'yes', 'partial', 'no', 'no', 'yes'],
      ['Pauta de ads integrada', 'yes', 'no', 'no', 'no', 'yes'],
      ['Modo piloto automático', 'yes', 'no', 'no', 'no', 'no'],
      ['Costo mensual', '$49', '$30+', '$15+', '$49+', '$5,000+', 'price'],
    ],
    partial: 'parcial',
  },
  lang: {
    h2: ['Pensado en español.', 'Listo para el mundo.'],
    em: 'Listo para el mundo.',
    sub: 'Kefy entiende los matices del marketing en cada mercado de habla hispana. Y genera contenido en inglés con la misma fluidez.',
    more: 'más idiomas en 2026',
  },
  pricing: {
    tag: 'Precios',
    h2: 'Mucho menos que contratar a alguien. Mucho más que cualquier otra herramienta.',
    plans: [
      {
        name: 'Starter',
        price: '0',
        per: '/ siempre',
        tagline: 'Para probar antes de comprometerte.',
        features: [
          '1 marca',
          '20 piezas de contenido al mes',
          '2 canales',
          { dim: true, t: 'Sin programación automática' },
          { dim: true, t: 'Sin pauta de ads' },
          { dim: true, t: 'Sin piloto automático' },
        ],
        cta: 'Empieza gratis',
      },
      {
        name: 'Pro',
        badge: 'Más popular',
        price: '49',
        per: '/ mes',
        tagline: 'Para negocios que publican en serio.',
        features: [
          '3 marcas',
          'Contenido ilimitado',
          '6 canales (IG, FB, LinkedIn, TikTok, X, Email)',
          'Multiplicador de contenido',
          'Calendario y programación',
          'Analytics completas',
          'Pauta de ads desde Kefy',
        ],
        cta: 'Empezar Pro',
        featured: true,
      },
      {
        name: 'Business',
        price: '149',
        per: '/ mes',
        tagline: 'Para equipos que gestionan varias marcas.',
        features: [
          'Marcas ilimitadas',
          '5 miembros del equipo',
          'Todo de Pro',
          'Modo piloto automático',
          'Brand kits multi-marca',
          'Reportes white-label',
          'Soporte prioritario · API access',
        ],
        cta: 'Hablar con ventas',
      },
    ],
    closer: 'Sin contrato. Cancela cuando quieras. Migración gratuita desde otras plataformas.',
  },
  testi: {
    tag: 'Voces',
    h2: 'Negocios que dejaron de hacer marketing solos.',
    items: [
      { q: 'Tengo una tienda de ropa. Antes publicaba cuando podía. Con Kefy publico todos los días y mis ventas por Instagram subieron 60%.', name: 'Camila Pérez', role: 'Fundadora, Trazo Studio', flag: '🇨🇱', avatar: 'CP' },
      { q: 'Soy dueño de un café. No tengo tiempo para Instagram. Kefy lo hace por mí.', name: 'Diego Morales', role: 'Dueño, Café Bento', flag: '🇲🇽', avatar: 'DM' },
      { q: 'Soy consultora independiente. Kefy me dio una presencia en LinkedIn que parece de una agencia. Cerré 3 clientes en 2 meses.', name: 'Valentina Ríos', role: 'Consultora, Foco Estrategia', flag: '🇨🇴', avatar: 'VR' },
      { q: 'Activé el modo piloto automático hace 40 días. No he abierto Kefy. Mis redes nunca habían estado tan activas.', name: 'Pablo Echeverría', role: 'Fundador, Norte SaaS', flag: '🇦🇷', avatar: 'PE' },
      { q: 'Antes pagaba a una agencia $1.400 al mes solo para programar. Hoy Kefy lo hace mejor y por menos.', name: 'Lucía Hernández', role: 'CMO, Tienda Bonita', flag: '🇪🇸', avatar: 'LH' },
      { q: 'We replaced 4 tools and a part-time contractor with Kefy. The autopilot weeks are quietly the best ones.', name: 'Marcus Reed', role: 'Founder, Plainsight', flag: '🇺🇸', avatar: 'MR' },
    ],
  },
  final: {
    tag: 'Beta abierta',
    h2: 'Deja de hacer marketing solo.',
    sub: 'Únete a la beta. Acceso gratis hasta el lanzamiento. Sin tarjeta, sin compromiso.',
    cta: 'Quiero acceso temprano',
    note: '600+ negocios ya en la lista · Lanzamiento Q3 2026',
  },
  footer: {
    tagline: 'Tu equipo de marketing, en una sola plataforma.',
    cols: [
      { h: 'Producto', items: ['Cómo funciona', 'Funcionalidades', 'Precios', 'Multiplicador', 'Piloto automático'] },
      { h: 'Empresa', items: ['Sobre Kefy', 'Blog', 'Casos de éxito', 'Carreras'] },
      { h: 'Recursos', items: ['Guías de marketing', 'Plantillas', 'API docs', 'Status'] },
      { h: 'Legal', items: ['Términos', 'Privacidad', 'Cookies'] },
    ],
    origin: 'Hecho en LATAM, para el mundo',
    copy: '© 2026 Kefy',
  },
};

const en: KefyCopy = {
  nav: {
    links: [
      { id: 'how', label: 'How it works' },
      { id: 'features', label: 'Features' },
      { id: 'pricing', label: 'Pricing' },
      { id: 'blog', label: 'Blog' },
    ],
    signin: 'Sign in',
    primary: 'Start for free',
  },
  hero: {
    tag: 'Your marketing team in one platform',
    h1: ['The marketing team', 'your business needs.'],
    h1em: 'On autopilot.',
    sub: 'Kefy writes your content, designs your images, multiplies what you already have, publishes at the right time, and manages your campaigns. All from one place. No hiring needed.',
    cta1: 'Start for free',
    cta2: 'See how it works',
    stats: [
      { big: 'Text · Image · Video · Ads', lbl: 'all in one' },
      { big: '6', lbl: 'native channels' },
      { big: 'Auto', lbl: 'optional autopilot mode' },
    ],
  },
  demo: {
    contextLbl: 'Brand identity',
    contextProduct: 'Trazo Studio',
    contextDesc: 'Slow-fashion clothing store · Audience: women 25–40, LATAM · Sand + lime palette · Warm tone, no jargon · Brand: minimalist, editorial',
    channelsLbl: 'Active channel',
    goalLbl: 'This week',
    goalK: 'Mode',
    goalV: 'Autopilot',
    audienceK: 'Schedule',
    audienceV: '12 pieces / week',
    url: 'app.kefy.io / dashboard',
    outputs: {
      linkedin: {
        channel: 'LinkedIn',
        meta: '· post · 1,247 characters',
        body: "I've been running a clothing store alone for three years. Three.\n\nI posted when I remembered — once a week at best. Zero LinkedIn. Zero ads.\n\nSince I turned on @Kefy autopilot mode:\n→ 12 pieces per week across 4 networks\n→ Instagram sales up 60%\n\nAll I do now is review and approve. →",
      },
      meta: {
        channel: 'Meta Ads',
        meta: '· ad copy · 4 variants',
        body: "Primary text:\nYou don't have a marketing team. You have Kefy.\n\nHeadline:\nYour marketing on autopilot.\n\nCTA: Sign up",
      },
      x: {
        channel: 'X',
        meta: '· thread · 5 tweets',
        body: "things I was doing wrong in my business:\n\n— posting once a week\n— my instagram had 3 different styles\n— never ran an ad\n\ntoday kefy does all that. i just approve.\n\n1/5 →",
      },
    },
  },
  problem: {
    tag: 'The problem',
    h2: "You have a business. You don't have a marketing team.",
    intro: 'Startups, SMBs and online stores face the same problem: hiring a marketing team costs between $5,000 and $15,000 a month.',
    pains: [
      { num: '01', t: 'You post when you remember', d: 'Your Instagram has posts from three weeks ago. Your Facebook has been silent for a month.' },
      { num: '02', t: 'Your content stays as one piece', d: 'You recorded a video, wrote a blog post. And it stayed there. When it could have been multiplied into 20 pieces.' },
      { num: '03', t: 'Paid campaigns scare you', d: "You know you should run Meta ads. But opening Ads Manager feels like entering another dimension." },
    ],
    stats: [
      { v: 8.5, pre: '$', suf: 'k/mo', d: 'Average cost of a junior marketing team (3 people) in LATAM', warm: true },
      { v: 2.7, d: 'Average posts per week from an SMB without a dedicated team' },
      { v: 89, suf: '%', d: 'Small businesses that have never run a paid ad campaign' },
    ],
  },
  how: {
    tag: 'How it works',
    h2: 'Five steps. Zero friction.',
    intro: 'Set it up once. Decide how automated you want it to be.',
    steps: [
      { n: '01', ic: '🧠', t: 'Learn your business', d: 'Upload your logo, palette, products and tone. Kefy builds your brand identity.' },
      { n: '02', ic: '✍️', t: 'Create new content', d: 'Text, image, video and design. For promotions, launches or authority building.' },
      { n: '03', ic: '🔁', t: 'Multiply what you have', d: 'Upload a video, blog or photo. Kefy turns it into 10 pieces for each channel.' },
      { n: '04', ic: '📅', t: 'Publish at the right time', d: "Connect your networks. Kefy publishes when your audience is active." },
      { n: '05', ic: '🎯', t: 'Measure and boost with ads', d: 'Every post has metrics. Kefy turns winners into paid ads on Meta.' },
    ],
    closer: ['Or turn on', 'autopilot mode', 'and let Kefy run the whole cycle for you.'],
  },
  mult: {
    tag: 'Content multiplication',
    h2: ['One piece. Twenty versions.', 'Zero effort.'],
    sub: 'Upload what you already created and Kefy transforms it into every piece your marketing needs.',
    bullets: [
      { ic: '🎬', t: 'From long video to reels and shorts' },
      { ic: '📸', t: 'From product photo to posts, ads and banners' },
      { ic: '📄', t: 'From blog post to threads, emails and carousels' },
      { ic: '🎙️', t: 'From podcast to clips, quotes and posts' },
    ],
    inLbl: 'Input',
    inV: '60s video · product',
    outLbl: 'Outputs',
    outputs: [
      { k: 'Reel 15s', sub: 'Instagram · TikTok' },
      { k: 'Carousel 6 slides', sub: 'Instagram · LinkedIn' },
      { k: 'LinkedIn Post', sub: '1,200 characters' },
      { k: 'Email', sub: '312 words' },
      { k: 'Story 9:16', sub: 'Instagram · Facebook' },
      { k: 'Thread X', sub: '5 tweets' },
      { k: 'Ad copy 4×', sub: 'Meta · 4 variants' },
      { k: 'Banner 16:9', sub: 'Web · email header' },
      { k: 'Product description', sub: 'Store · 180 words' },
      { k: 'YouTube thumbnail', sub: '1280×720' },
    ],
  },
  brand: {
    tag: 'Brand identity',
    h2: ['Your brand, applied to', 'every piece', 'that goes out to the world.'],
    sub: 'Kefy learns your palette, typography, tone and visual style and applies that identity to everything.',
    bullets: [
      { ic: '🎨', t: 'Complete brand kit (colors, fonts, logos)' },
      { ic: '🗣️', t: 'Configurable and consistent voice tone' },
      { ic: '📐', t: 'Templates adapted to your identity' },
      { ic: '✨', t: "Don't have a brand yet? Kefy helps you build one" },
    ],
    kit: {
      palette: 'Palette',
      type: 'Typography',
      logo: 'Logo',
      tone: 'Tone',
      toneV: 'Warm · direct · no jargon',
      typeV: 'Syne · DM Sans',
    },
  },
  killer: {
    tag: 'Metrics & campaigns',
    h2: ['See what works.', 'Promote the best.', 'Without opening another tab.'],
    sub: 'All your network metrics in one dashboard. When a post connects, Kefy alerts you and offers to turn it into a paid ad.',
    points: [
      { k: 'Unified dashboard', d: 'Engagement, reach, conversions from all your networks in one view.' },
      { k: 'Winner detection', d: 'Kefy identifies what type of content performs best for your audience.' },
      { k: 'Boost with one click', d: 'Turn any post into a paid ad without touching Meta Ads Manager.' },
    ],
    dash: {
      title: 'Performance · last 30 days',
      range: 'Last 30 days',
      stats: [
        { lbl: 'Reach', v: '184.2k', d: '+42%' },
        { lbl: 'Engagement', v: '6.8%', d: '+1.4 pts' },
        { lbl: 'Clicks', v: '12.4k', d: '+28%' },
        { lbl: 'IG Sales', v: '+60%', d: 'vs. prev. mo.' },
      ],
      posts: [
        { ic: '📷', text: 'Carousel new collection "Quiet Winter" — 8 products in editorial style', eng: '8.4%', winner: true, boost: 'Boost · $20/day' },
        { ic: 'in', text: "I've been running a clothing store alone for three years…", eng: '6.1%', winner: true, boost: 'Boost · $15/day' },
        { ic: '𝕏', text: 'things I was doing wrong in my business…', eng: '3.2%', winner: false, boost: 'Analyze' },
      ],
    },
  },
  autopilot: {
    tag: 'Autopilot',
    h2: ['Turn on autopilot mode.', 'Forget about marketing.'],
    sub: 'Set your calendar, define your budget and let Kefy do the rest.',
    bullets: [
      { ic: '🤖', t: 'Generates new content every week' },
      { ic: '📅', t: 'Publishes automatically at optimal times' },
      { ic: '🎯', t: 'Boosts winning posts within your budget' },
    ],
    closer: 'You review. You approve if you want. Or let it fly on its own.',
    togglePilot: 'Autopilot',
    toggleManual: 'Manual',
    schedule: [
      { day: 'Mon', items: [{ ic: '📷', t: 'IG Post · 09:00' }, { ic: '🎬', t: 'TikTok Reel · 19:00' }] },
      { day: 'Tue', items: [{ ic: 'in', t: 'LinkedIn Post · 08:30' }] },
      { day: 'Wed', items: [{ ic: '📷', t: 'IG Carousel · 18:00' }, { ic: '✉', t: 'Email · 11:00' }] },
      { day: 'Thu', items: [{ ic: '𝕏', t: 'X Thread · 14:00' }, { ic: '🎬', t: 'IG Story · 20:00' }] },
      { day: 'Fri', items: [{ ic: '📷', t: 'FB Post · 10:00' }, { ic: '🎯', t: 'Auto boost · $20' }] },
      { day: 'Sat', items: [{ ic: '🎬', t: 'IG Reel · 12:00' }] },
      { day: 'Sun', items: [{ ic: '📊', t: 'Weekly report' }] },
    ],
  },
  features: {
    tag: 'Everything included',
    h2: 'A full team. One subscription.',
    items: [
      { ic: '🧠', t: 'Brand identity', d: 'Create or apply your brand to every piece.' },
      { ic: '✍️', t: 'Text generation', d: 'Posts, emails, ads, product descriptions.' },
      { ic: '🎨', t: 'Design & images', d: 'Images, carousels, banners, templates.' },
      { ic: '🎬', t: 'Video & reels', d: '15–60s clips with your own voice and identity.' },
      { ic: '📅', t: 'Scheduling', d: 'Instagram, Facebook, LinkedIn, TikTok, X, email.' },
      { ic: '🎯', t: 'Paid campaigns', d: 'Run Meta ads without leaving Kefy.' },
    ],
  },
  who: {
    tag: 'Who is it for?',
    h2: ['If your business', 'needs marketing', "but doesn't have a team, Kefy is for you."],
    segments: [
      { ic: '🛒', t: 'Online stores & e-commerce', d: 'Launch products, create promotions, multiply your photos into posts and ads.' },
      { ic: '🏪', t: 'SMBs with physical products or services', d: 'Build local authority and automate your networks without losing personality.' },
      { ic: '🚀', t: 'Growing startups', d: 'Build brand and generate demand without waiting to have a full team.' },
      { ic: '💼', t: 'Mid-size companies', d: "Multiply your current team's output. What 5 people did, with 2 and Kefy." },
    ],
  },
  channels: {
    h3: ['Publish natively on', 'all your networks.'],
    sub: 'Connect your accounts once. Kefy adapts each piece to every platform format.',
    items: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'X', 'YouTube Shorts', 'Email', 'Meta Ads'],
  },
  cmp: {
    tag: 'Why Kefy',
    h2: 'Every tool does one thing. Kefy does them all.',
    cols: ['Kefy', 'Buffer / Hootsuite', 'Canva', 'Copy.ai', 'Agency'],
    rows: [
      ['Generates text with your brand context', 'yes', 'no', 'no', 'partial', 'yes'],
      ['Creates images & designs with your identity', 'yes', 'no', 'partial', 'no', 'yes'],
      ['Generates short videos', 'yes', 'no', 'partial', 'no', 'yes'],
      ['Multiplies your existing content', 'yes', 'no', 'no', 'no', 'partial'],
      ['Schedules & publishes to all networks', 'yes', 'yes', 'no', 'no', 'partial'],
      ['Unified analytics', 'yes', 'partial', 'no', 'no', 'yes'],
      ['Integrated ads management', 'yes', 'no', 'no', 'no', 'yes'],
      ['Autopilot mode', 'yes', 'no', 'no', 'no', 'no'],
      ['Monthly cost', '$49', '$30+', '$15+', '$49+', '$5,000+', 'price'],
    ],
    partial: 'partial',
  },
  lang: {
    h2: ['Built for Spanish.', 'Ready for the world.'],
    em: 'Ready for the world.',
    sub: 'Kefy understands the nuances of marketing in every Spanish-speaking market. And generates English content with the same fluency.',
    more: 'more languages in 2026',
  },
  pricing: {
    tag: 'Pricing',
    h2: 'Way less than hiring someone. Way more than any other tool.',
    plans: [
      {
        name: 'Starter',
        price: '0',
        per: '/ forever',
        tagline: 'Try before you commit.',
        features: [
          '1 brand',
          '20 content pieces per month',
          '2 channels',
          { dim: true, t: 'No auto scheduling' },
          { dim: true, t: 'No ad campaigns' },
          { dim: true, t: 'No autopilot mode' },
        ],
        cta: 'Start for free',
      },
      {
        name: 'Pro',
        badge: 'Most popular',
        price: '49',
        per: '/ month',
        tagline: 'For businesses that publish seriously.',
        features: [
          '3 brands',
          'Unlimited content',
          '6 channels (IG, FB, LinkedIn, TikTok, X, Email)',
          'Content multiplier',
          'Calendar & scheduling',
          'Full analytics',
          'Ad campaigns from Kefy',
        ],
        cta: 'Start Pro',
        featured: true,
      },
      {
        name: 'Business',
        price: '149',
        per: '/ month',
        tagline: 'For teams managing multiple brands.',
        features: [
          'Unlimited brands',
          '5 team members',
          'Everything in Pro',
          'Autopilot mode',
          'Multi-brand kits',
          'White-label reports',
          'Priority support · API access',
        ],
        cta: 'Talk to sales',
      },
    ],
    closer: 'No contract. Cancel anytime. Free migration from other platforms.',
  },
  testi: {
    tag: 'Voices',
    h2: 'Businesses that stopped doing marketing alone.',
    items: [
      { q: "I have a clothing store. I used to post whenever I could. With Kefy I post every day and my Instagram sales are up 60%.", name: 'Camila Pérez', role: 'Founder, Trazo Studio', flag: '🇨🇱', avatar: 'CP' },
      { q: "I own a café. I don't have time for Instagram. Kefy does it for me.", name: 'Diego Morales', role: 'Owner, Café Bento', flag: '🇲🇽', avatar: 'DM' },
      { q: "I'm an independent consultant. Kefy gave me a LinkedIn presence that looks like an agency. I closed 3 clients in 2 months.", name: 'Valentina Ríos', role: 'Consultant, Foco Estrategia', flag: '🇨🇴', avatar: 'VR' },
      { q: "I turned on autopilot mode 40 days ago. I haven't opened Kefy. My networks have never been this active.", name: 'Pablo Echeverría', role: 'Founder, Norte SaaS', flag: '🇦🇷', avatar: 'PE' },
      { q: "I used to pay an agency $1,400/month just for scheduling. Today Kefy does it better and for less.", name: 'Lucía Hernández', role: 'CMO, Tienda Bonita', flag: '🇪🇸', avatar: 'LH' },
      { q: "We replaced 4 tools and a part-time contractor with Kefy. The autopilot weeks are quietly the best ones.", name: 'Marcus Reed', role: 'Founder, Plainsight', flag: '🇺🇸', avatar: 'MR' },
    ],
  },
  final: {
    tag: 'Open beta',
    h2: 'Stop doing marketing alone.',
    sub: 'Join the beta. Free access until launch. No card, no commitment.',
    cta: 'I want early access',
    note: '600+ businesses already on the list · Launching Q3 2026',
  },
  footer: {
    tagline: 'Your marketing team, in one platform.',
    cols: [
      { h: 'Product', items: ['How it works', 'Features', 'Pricing', 'Multiplier', 'Autopilot'] },
      { h: 'Company', items: ['About Kefy', 'Blog', 'Case studies', 'Careers'] },
      { h: 'Resources', items: ['Marketing guides', 'Templates', 'API docs', 'Status'] },
      { h: 'Legal', items: ['Terms', 'Privacy', 'Cookies'] },
    ],
    origin: 'Made in LATAM, for the world',
    copy: '© 2026 Kefy',
  },
};

export const KEFY_COPY: Record<string, KefyCopy> = { es, en };
