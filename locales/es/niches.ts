import type { NicheId } from '@/lib/niches';
import type { NicheCopy, OfferCopy } from '@/types/locales';

// Landings por rubro (/es/para/<rubro>) y las dos ofertas que comparten con la
// home. Ver docs/landings-por-rubro.md.
//
// - El tono y los ganchos salen de los correos SDR de cada rubro: lo que se
//   promete en el correo es lo que la persona tiene que encontrar al llegar.
// - La plataforma (`offers.platform` y la página de agencias) no promete
//   anuncios: no tienen UI. Los anuncios los lleva el equipo en el servicio
//   gestionado (`offers.service` y los rubros de servicio).
//   tests/unit/lib/niches.test.ts lo vigila.
// - Los precios salen de lib/plans.ts: aquí van como parámetros.

/** Pregunta frecuente cuya respuesta lleva los precios de lib/plans.ts. */
export interface PricedFaq { q: string; a: (servicePrice: string, platformPrice: string) => string; }

const offers = {
  h2: 'Dos formas de tener tus redes al día',
  sub: 'Que lo hagamos nosotros, o que lo hagas tú con la misma plataforma que usamos.',
  /** Primer mensaje de WhatsApp desde la home (en un rubro va el suyo). */
  whatsapp: 'Hola, quiero saber cómo funciona el servicio de redes de Kefy.',
  service: {
    label: 'Lo hacemos nosotros',
    title: 'Servicio de redes',
    price: (usd: string) => `USD ${usd} / mes`,
    features: [
      'Publicamos todas las semanas, con la imagen de tu negocio',
      'Armamos y llevamos tus anuncios',
      'Respondemos mensajes y comentarios, también de noche y los fines de semana',
      'Tú solo nos avisas cuando hay algo nuevo',
    ],
    cta: 'Hablemos por WhatsApp',
    note: 'Partimos con una revisión de tus redes, sin costo.',
    imageAlt: 'Una community manager responde de noche los mensajes de los clientes',
  } satisfies OfferCopy,
  platform: {
    label: 'Lo haces tú',
    title: 'Plataforma Kefy',
    from: 'Desde',
    price: (usd: string) => `USD ${usd} / mes`,
    features: [
      'Crea posts, carruseles, reels y stories con tu marca',
      'Tú los apruebas y se publican en tus redes',
      'Piloto automático si no quieres revisar cada uno',
      'Comentarios y mensajes en un solo inbox, con respuestas automáticas',
    ],
    cta: 'Probar gratis',
    note: '30 días gratis · Sin tarjeta · Cancela cuando quieras',
    imageAlt: 'La dueña de una panadería aprueba una publicación desde su teléfono',
  } satisfies OfferCopy,
  agency: {
    h2: 'Un plan según cuántos clientes atiendes',
    sub: 'Cada cliente es una marca en Kefy. Toda cuenta empieza con 30 días gratis de Starter, que trae 1 marca; para atender más clientes eliges Pro o Business.',
    price: (usd: string) => `USD ${usd} / mes`,
    proTagline: (brands: string) => `Hasta ${brands} clientes, cada uno con su marca.`,
    businessTagline: (brands: string, members: string) => `Hasta ${brands} clientes y ${members} personas de tu equipo.`,
    proCta: 'Probar gratis',
    businessCta: 'Ver una demo de 15 minutos',
    note: '30 días gratis · Sin tarjeta · Cancela cuando quieras',
  },
};

const faqService: PricedFaq[] = [
  {
    q: '¿Qué necesitan de mí para empezar?',
    a: () => 'Lo que ya tienes: fotos, servicios, valores y promociones. Partimos con una revisión de tus redes, sin costo, y con eso armamos el primer mes.',
  },
  {
    q: '¿Cuánto cuesta y qué incluye?',
    a: (service) => `USD ${service} al mes. Incluye las publicaciones, el manejo de los anuncios y la respuesta a los mensajes. El presupuesto que se invierte en anuncios lo decides tú.`,
  },
  {
    q: '¿Y si prefiero hacerlo yo?',
    a: (_service, platform) => `Usa la plataforma: desde USD ${platform} al mes, con 30 días gratis y sin tarjeta. Kefy crea las publicaciones con tu marca y tú las apruebas antes de que salgan.`,
  },
];

const faqPlatform: PricedFaq[] = [
  {
    q: '¿Qué pasa al terminar los 30 días gratis?',
    a: () => 'Todo lo que creaste sigue ahí. Para seguir publicando eliges un plan; no pedimos tarjeta para empezar, así que no se cobra nada sin que lo elijas.',
  },
  {
    q: '¿Y si prefiero que lo hagan ustedes?',
    a: (service) => `También llevamos redes: USD ${service} al mes por marca, con publicaciones, anuncios y respuesta a los mensajes. Escríbenos y lo vemos.`,
  },
];

const niches = {
  dental: {
    name: 'Clínicas dentales',
    card: 'Promociones al día y cada consulta respondida, también fuera de horario.',
    meta: {
      title: 'Redes sociales para clínicas dentales | Kefy',
      description: 'Publicamos los tratamientos y promociones de tu clínica, llevamos los anuncios y respondemos las consultas por mensaje, también de noche. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para clínicas dentales',
      h1: 'Tu clínica, activa en redes todas las semanas.',
      em: 'Y cada consulta respondida, también de noche.',
      sub: 'Publicamos tus tratamientos y promociones, llevamos los anuncios que llevan a tu agenda y respondemos a quien pregunta por valores, cuotas o la evaluación. Tú atiendes pacientes.',
    },
    image: { alt: 'Recepción de una clínica dental de noche, con un teléfono que recibe un mensaje', ideasAlt: 'Teléfono con el perfil de una clínica dental: pacientes, equipo y tratamientos' },
    aeo: {
      what: '¿Qué hace Kefy por una clínica dental?',
      post: '¿Qué publicar en las redes sociales de una clínica dental?',
    },
    pains: {
      h2: 'Lo que vemos en muchas clínicas',
      items: [
        { t: 'Las consultas de la noche se responden al otro día.', d: 'Para entonces, quien preguntaba por un implante ya le escribió a otra clínica.' },
        { t: 'Las promociones vencen sin que nadie se entere.', d: 'La web sigue anunciando una fecha que ya pasó y en Instagram no aparecen.' },
        { t: 'Las buenas reseñas solo las ve quien ya llegó a tu web.', d: 'Tu mejor prueba no está donde la gente decide a qué clínica ir.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos cada semana', d: 'Tratamientos, promociones con su fecha real, tu equipo y lo que dicen tus pacientes, con la imagen de tu clínica.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas que llevan a tu página de agenda o a tu WhatsApp, para las promociones que te importan.' },
        { t: 'Respondemos cada consulta', d: 'Valores, cuotas, convenios y la evaluación, por mensaje y en comentarios. A tu equipo le llega quien ya quiere agendar.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos de lo que sale de tu propia clínica, sin fotos de banco.',
      items: [
        'La promoción del mes, con su fecha de término',
        'Qué incluye la primera evaluación',
        'Cuánto dura una ortodoncia y cómo se paga',
        'Mitos y verdades del blanqueamiento',
        'Quién te atiende: el equipo de la clínica',
        'La reseña de un paciente, con su permiso',
      ],
    },
    faq: [
      { q: '¿Quién responde los mensajes?', a: 'Nosotros, con la información que acordamos contigo: valores, cuotas, convenios y horarios. Si alguien pregunta algo clínico, se lo pasamos a tu equipo.' },
      { q: '¿Sirve si ya tengo una página para agendar?', a: 'Sí, y mejor: los anuncios y las respuestas llevan a esa página, para que la gente agende sin pasar por el teléfono.' },
    ],
    final: { h2: 'Que la próxima consulta de la noche no se pierda.', sub: 'Cuéntanos de tu clínica por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo una clínica dental y quiero saber cómo trabajan con las redes.',
  },
  estetica: {
    name: 'Clínicas estéticas',
    card: 'Tratamientos y campañas de temporada publicados, y cada pregunta por precio respondida.',
    meta: {
      title: 'Redes sociales para clínicas estéticas | Kefy',
      description: 'Publicamos tus tratamientos y campañas de temporada, llevamos los anuncios y respondemos a quien pregunta por precios o cuotas. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para clínicas estéticas y spas',
      h1: 'Tus tratamientos y promociones, en redes todas las semanas.',
      em: 'Y cada pregunta por precio, respondida.',
      sub: 'Publicamos tus tratamientos y campañas de temporada, llevamos los anuncios y respondemos a quien pregunta por valores o cuotas, para que llegue a la evaluación ya informada.',
    },
    image: { alt: 'Sala de tratamiento de una clínica estética y un teléfono con publicaciones de tratamientos', ideasAlt: 'Un teléfono en un trípode graba un tratamiento facial en una clínica estética' },
    aeo: {
      what: '¿Qué hace Kefy por una clínica estética?',
      post: '¿Qué publicar en las redes sociales de una clínica estética?',
    },
    pains: {
      h2: 'Lo que vemos en muchas clínicas',
      items: [
        { t: 'Te preguntan el precio por mensaje y nadie alcanza a contestar.', d: 'Entre una paciente y otra, los mensajes se acumulan y se enfrían.' },
        { t: 'La campaña de temporada se publica una vez y se pierde.', d: 'El plan de verano dura semanas, pero en redes aparece un solo día.' },
        { t: 'Los packs y las gift cards dependen de que alguien se acuerde.', d: 'Fin de año es cuando más se venden, y cuando menos tiempo hay para publicarlos.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos cada semana', d: 'Tratamientos, resultados con permiso de tus pacientes, tu equipo y cada campaña hasta el día en que termina.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas para la temporada y los packs, que llevan a tu agenda o a tu WhatsApp.' },
        { t: 'Respondemos cada consulta', d: 'Precios, cuotas y disponibilidad, por mensaje y en comentarios. A tu equipo le llega quien ya quiere su evaluación.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos de lo que sale de tu propia clínica.',
      items: [
        'El plan de la temporada, con su fecha de término',
        'Qué incluye la evaluación gratuita',
        'Las preguntas de un tratamiento, en un carrusel',
        'Cuidados antes y después de una sesión',
        'Gift cards para regalar en Navidad',
        'Quién te atiende y su formación',
      ],
    },
    faq: [
      { q: '¿Quién responde los mensajes?', a: 'Nosotros, con los valores, cuotas y horarios que acordamos contigo. Lo que necesite criterio profesional se lo pasamos a tu equipo.' },
      { q: '¿Pueden publicar resultados de pacientes?', a: 'Solo los que tú nos compartas, con el permiso de la paciente. Si no tienes, trabajamos con tratamientos, equipo y preguntas frecuentes.' },
    ],
    final: { h2: 'Que la campaña de esta temporada llegue a todas las que la están buscando.', sub: 'Cuéntanos de tu clínica por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo una clínica estética y quiero saber cómo trabajan con las redes.',
  },
  fitness: {
    name: 'Estudios de pilates, yoga y fitness',
    card: 'Clases, talleres y la clase de prueba en redes, mientras tú das clases.',
    meta: {
      title: 'Redes sociales para estudios de pilates, yoga y fitness | Kefy',
      description: 'Publicamos tus clases y talleres, llevamos los anuncios y respondemos a quien pregunta por la clase de prueba. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para estudios de pilates, yoga y fitness',
      h1: 'Las redes de tu estudio al día, mientras tú das clases.',
      em: 'Y cada pregunta por la clase de prueba, respondida.',
      sub: 'Publicamos tus clases, talleres y promociones, llevamos los anuncios y respondemos a quien quiere probar. Tú te dedicas a tus alumnos.',
    },
    image: { alt: 'Instructora ajustando un reformer en un estudio de pilates', ideasAlt: 'Un teléfono en un trípode graba una clase de pilates en reformer' },
    aeo: {
      what: '¿Qué hace Kefy por un estudio de pilates, yoga o fitness?',
      post: '¿Qué publicar en las redes de un estudio de pilates o yoga?',
    },
    pains: {
      h2: 'Lo que vemos en muchos estudios',
      items: [
        { t: 'Quien da las clases también lleva las redes.', d: 'Y entre clase y clase no queda tiempo para publicar.' },
        { t: 'La portada sigue anunciando el taller que ya pasó.', d: 'Quien entra hoy no sabe qué viene.' },
        { t: 'Te preguntan por la clase de prueba y la respuesta llega tarde.', d: 'Para entonces ya se inscribió en otro lado.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos cada semana', d: 'Horarios, clases, talleres antes y después, y tu comunidad, con la imagen de tu estudio.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas para la clase de prueba, los talleres y las promociones de temporada.' },
        { t: 'Respondemos cada consulta', d: 'Horarios, valores, planes y la clase de prueba. A ti te llega quien ya quiere venir.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos de lo que sale de tu propio estudio.',
      items: [
        'Cómo reservar la clase de prueba',
        'La preventa del próximo taller',
        'Cómo estuvo el último taller, en un reel',
        'La promo de traer a una amiga',
        'Los horarios de la semana',
        'Conoce a tus profes',
      ],
    },
    faq: [
      { q: '¿Necesito grabar videos?', a: 'Ayuda, pero no es obligatorio. Con fotos de tus clases y del estudio armamos posts, carruseles y reels.' },
      { q: '¿Sirve si ya tengo un sistema de reservas?', a: 'Sí: las publicaciones, los anuncios y las respuestas llevan a ese sistema, para que la gente reserve sola.' },
    ],
    final: { h2: 'Que tu próximo taller se llene antes de que empiece.', sub: 'Cuéntanos de tu estudio por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo un estudio y quiero saber cómo trabajan con las redes.',
  },
  academias: {
    name: 'Institutos y academias',
    card: 'Cursos, fechas de matrícula y cupos publicados, y cada consulta respondida.',
    meta: {
      title: 'Redes sociales para institutos, academias y preuniversitarios | Kefy',
      description: 'Publicamos tus cursos y fechas de matrícula, llevamos los anuncios y respondemos las consultas por valores, horarios y cupos. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para institutos, academias y preuniversitarios',
      h1: 'Que se enteren de tus cursos antes de que cierre la matrícula.',
      em: 'Y que cada consulta tenga respuesta.',
      sub: 'Publicamos tus cursos con sus fechas y cupos, llevamos los anuncios para la matrícula y respondemos a quien pregunta por valores, horarios o sedes.',
    },
    image: { alt: 'Clase en un instituto, con una profesora y un grupo de estudiantes', ideasAlt: 'Una joven revisa en su teléfono las publicaciones de los cursos de un instituto' },
    aeo: {
      what: '¿Qué hace Kefy por un instituto o una academia?',
      post: '¿Qué publicar en las redes de un instituto para conseguir matrículas?',
    },
    pains: {
      h2: 'Lo que vemos en muchos institutos',
      items: [
        { t: 'La matrícula de marzo se decide en noviembre y diciembre.', d: 'Si en esas semanas tus redes están quietas, otro instituto aparece primero.' },
        { t: 'Con muchos cursos, cada uno se publica una vez y se pierde.', d: 'El descuento de matrícula vence sin que se entere quien lo estaba buscando.' },
        { t: 'Las consultas llegan a todas horas y de todas las sedes.', d: 'Valores, horarios, requisitos: siempre las mismas preguntas, siempre esperando.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos cada semana', d: 'Cursos, fechas de inicio, cupos y descuentos de matrícula, hasta el día en que terminan.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas para la matrícula y la admisión, en las ciudades donde tienes sedes.' },
        { t: 'Respondemos cada consulta', d: 'Valores, horarios, requisitos y sedes, por mensaje y en comentarios. A tu equipo le llega quien ya quiere matricularse.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos de lo que sale de tu propio instituto.',
      items: [
        'Fechas de inicio y cupos de cada curso',
        'El descuento de matrícula y hasta cuándo vale',
        'Un día de clases, en un reel',
        'Lo que cuenta un exalumno, con su permiso',
        'Cómo es el proceso de inscripción',
        'Sedes, horarios y modalidades',
      ],
    },
    faq: [
      { q: '¿Sirve si tenemos varias sedes?', a: 'Sí. Publicamos lo de cada sede y los anuncios se muestran en las ciudades que eliges.' },
      { q: '¿Pueden publicar muchos cursos a la vez?', a: 'Sí: armamos un calendario para que cada curso tenga su turno antes de su fecha de inicio, sin que uno tape al otro.' },
    ],
    final: { h2: 'Que la matrícula de marzo empiece en tus redes.', sub: 'Cuéntanos de tu instituto por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo un instituto y quiero saber cómo trabajan con las redes.',
  },
  turismo: {
    name: 'Alojamientos turísticos',
    card: 'Tus cabañas o tu lodge todo el año en redes, con el enlace para reservar directo.',
    meta: {
      title: 'Redes sociales para cabañas, lodges y alojamientos | Kefy',
      description: 'Mostramos tu alojamiento todo el año, llevamos los anuncios y respondemos a quien pregunta por fechas con el enlace para reservar directo. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para cabañas, lodges y hoteles boutique',
      h1: 'Tu alojamiento en redes todo el año, con el enlace para reservar directo.',
      em: 'Sin comisión de por medio.',
      sub: 'Mostramos tu lugar en cada temporada, llevamos los anuncios y respondemos a quien pregunta por fechas, con el enlace a tu motor de reservas o a tu WhatsApp.',
    },
    image: { alt: 'Cabaña junto a un lago en el sur de Chile, con una tinaja en la terraza', ideasAlt: 'Una pareja planea un viaje mirando en el teléfono fotos de una cabaña y un lago' },
    aeo: {
      what: '¿Qué hace Kefy por una cabaña, un lodge o un hotel boutique?',
      post: '¿Qué publicar en las redes de un alojamiento para conseguir reservas directas?',
    },
    pains: {
      h2: 'Lo que vemos en muchos alojamientos',
      items: [
        { t: 'Quien te encuentra en redes termina reservando por Airbnb o Booking.', d: 'Y por esa reserva pagas comisión.' },
        { t: 'En plena temporada no hay tiempo para publicar ni contestar.', d: 'Atender a los huéspedes va primero, y las redes quedan para después.' },
        { t: 'Te preguntan por fechas y la respuesta llega tarde.', d: 'Para entonces ya reservaron en otro lado.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos todo el año', d: 'El lugar en cada estación, la experiencia de la estadía y lo que hay para hacer cerca.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas antes de cada temporada y fin de semana largo, que llevan a tu reserva directa.' },
        { t: 'Respondemos cada consulta', d: 'Fechas, valores y servicios, siempre con el enlace para reservar contigo.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos de lo que sale de tu propio alojamiento.',
      items: [
        'Tu lugar en esta temporada, en un reel',
        'Qué hacer cerca: rutas, playas y restaurantes',
        'El desayuno y los detalles de la estadía',
        'Disponibilidad para el próximo fin de semana largo',
        'Por qué conviene reservar directo',
        'Lo que dicen tus huéspedes, con su permiso',
      ],
    },
    faq: [
      { q: '¿Sirve si ya estoy en Airbnb y Booking?', a: 'Sí. No se trata de salir de esas plataformas, sino de que quien te descubre en redes reserve contigo.' },
      { q: '¿Y si no tengo motor de reservas?', a: 'Las respuestas llevan a tu WhatsApp o a tu correo, donde cierras la reserva como ya lo haces.' },
    ],
    final: { h2: 'Que la próxima temporada se reserve directo contigo.', sub: 'Cuéntanos de tu alojamiento por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo un alojamiento turístico y quiero saber cómo trabajan con las redes.',
  },
  hogar: {
    name: 'Proyectos para el hogar',
    card: 'Tus proyectos terminados en redes y cada cotización respondida con lo que necesitas saber.',
    meta: {
      title: 'Redes sociales para empresas de cocinas, cierres, paisajismo y proyectos | Kefy',
      description: 'Publicamos tus proyectos terminados, llevamos los anuncios y respondemos cada consulta pidiendo lo que necesitas para cotizar. Desde USD 200 al mes.',
    },
    hero: {
      tag: 'Para cocinas, cierres, paisajismo, energía y remodelación',
      h1: 'Tus proyectos terminados, en redes cada semana.',
      em: 'Y cada cotización, con lo que necesitas saber.',
      sub: 'Publicamos tus proyectos con las fotos que ya tienes, llevamos los anuncios y respondemos cada consulta pidiendo comuna, medidas y tipo de proyecto. A ti te llega quien ya quiere la visita.',
    },
    image: { alt: 'Un instalador fotografía con su teléfono un cierre de terraza recién terminado', ideasAlt: 'Cocina remodelada con una tableta que muestra fotos del antes y el después' },
    aeo: {
      what: '¿Qué hace Kefy por una empresa de proyectos para el hogar?',
      post: '¿Qué publicar en las redes de una empresa de cocinas, cierres o paisajismo?',
    },
    pains: {
      h2: 'Lo que vemos en muchas empresas',
      items: [
        { t: 'Quien pregunta por redes no llega al formulario de cotización.', d: 'Escribe, nadie le contesta a tiempo y cotiza con otro.' },
        { t: 'Tienes cientos de proyectos terminados y no se publican.', d: 'La mejor prueba de tu trabajo está guardada en el teléfono.' },
        { t: 'Las consultas llegan sin comuna, medidas ni presupuesto.', d: 'Y cada cotización empieza con cinco preguntas de ida y vuelta.' },
      ],
    },
    does: {
      h2: 'Nos encargamos de tus redes',
      items: [
        { t: 'Publicamos cada semana', d: 'Un proyecto distinto cada vez, con sus materiales, el antes y el después.' },
        { t: 'Llevamos tus anuncios', d: 'Campañas en las comunas donde trabajas, que llevan a tu formulario o a tu WhatsApp.' },
        { t: 'Respondemos y filtramos', d: 'Pedimos comuna, medidas y tipo de proyecto. A ti te llega quien ya quiere la visita.' },
      ],
    },
    ideas: {
      h2: 'Lo que publicaríamos este mes',
      sub: 'Ejemplos que salen de tus propios proyectos.',
      items: [
        'El antes y el después de un proyecto',
        'Un proyecto por semana, con sus materiales',
        'Cómo trabajamos: visita, cotización e instalación',
        'Plazos y garantía, en preguntas frecuentes',
        'El equipo en terreno',
        'Las comunas donde trabajas',
      ],
    },
    faq: [
      { q: '¿Necesito fotos profesionales?', a: 'No. Con las fotos que ya tienes de tus proyectos armamos publicaciones con la imagen de tu empresa.' },
      { q: '¿Ustedes cotizan?', a: 'No: reunimos los datos que necesitas para cotizar (comuna, medidas, tipo de proyecto) y te pasamos el contacto. La cotización y la visita las haces tú.' },
    ],
    final: { h2: 'Que tus proyectos terminados te traigan los próximos.', sub: 'Cuéntanos de tu empresa por WhatsApp y te mostramos cómo trabajamos.' },
    whatsapp: 'Hola, tengo una empresa de proyectos para el hogar y quiero saber cómo trabajan con las redes.',
  },
  agencias: {
    name: 'Agencias de marketing',
    card: 'Más clientes por persona: Kefy arma las piezas y tu equipo las corrige y programa.',
    meta: {
      title: 'Kefy para agencias de marketing y community managers | Kefy',
      description: 'Cada cliente es una marca con su kit y su estrategia. Kefy arma el calendario del mes y tu equipo corrige y programa en vez de partir de cero. 30 días gratis.',
    },
    hero: {
      tag: 'Para agencias y community managers',
      h1: 'Más clientes por persona, sin sumar gente al equipo.',
      em: 'Kefy arma las piezas; tu equipo las corrige y las programa.',
      sub: 'Cada cliente queda como una marca con sus colores, su tono y su estrategia. El calendario del mes sale armado desde ahí, y tu diseñadora ajusta en vez de partir de cero.',
    },
    image: { alt: 'Dos diseñadores de una agencia revisan publicaciones de varias marcas en un monitor', ideasAlt: 'Laptop con el calendario de contenido de un mes y teléfonos con vistas previas de publicaciones' },
    aeo: {
      what: '¿Qué hace Kefy por una agencia de marketing?',
      post: '¿Qué produce Kefy para cada cliente de una agencia?',
    },
    pains: {
      h2: 'Lo que vemos en muchas agencias',
      items: [
        { t: 'Cada cliente nuevo son decenas de piezas más al mes.', d: 'Para la misma community manager y la misma diseñadora.' },
        { t: 'Cada pieza parte de una hoja en blanco.', d: 'Aunque la marca, el tono y la estrategia del cliente ya estén definidos.' },
        { t: 'Los comentarios y mensajes de cada cliente están en otra cuenta.', d: 'Revisarlos todos los días es otro trabajo.' },
      ],
    },
    does: {
      h2: 'Qué hace Kefy por tu agencia',
      items: [
        { t: 'Una marca por cliente', d: 'Colores, tipografías, logo, tono y estrategia, tomados de su web. Cada pieza sale en su identidad.' },
        { t: 'El calendario del mes, armado', d: 'Posts, carruseles, reels y stories para cada red. Tu equipo los corrige y los programa, o los deja en piloto automático.' },
        { t: 'Mensajes con respuestas automáticas', d: 'Comentarios y mensajes de cada marca en un inbox, con respuestas automáticas según tus reglas.' },
      ],
    },
    ideas: {
      h2: 'Lo que sale de Kefy para cada cliente',
      sub: 'Todo dentro de la marca del cliente, listo para revisar.',
      items: [
        'Calendario mensual con posts, carruseles, reels y stories',
        'Textos en español o en inglés, en el tono de cada marca',
        'Imágenes y videos con los colores y tipografías del cliente',
        'Programación en 11 redes',
        'Piloto automático para los clientes de mantención',
        'API y servidor MCP para conectar tus propias herramientas',
      ],
    },
    faq: [
      { q: '¿Cuántas personas de mi equipo pueden entrar?', a: 'Pro es para una persona; Business suma hasta 5 miembros del equipo trabajando sobre las mismas marcas.' },
      { q: '¿Y si el cliente ya tiene su estrategia?', a: 'La guardas como estrategia propia de su marca (objetivo, KPI, llamado a la acción y calendario) y Kefy la sigue en cada pieza. Si no tiene, eliges una del catálogo.' },
    ],
    final: { h2: 'Atiende al próximo cliente con el mismo equipo.', sub: 'Pruébalo 30 días gratis con una marca, o te lo mostramos en 15 minutos con una cuenta de un rubro que ya atiendes.' },
    whatsapp: 'Hola, tengo una agencia y quiero ver Kefy funcionando con una marca.',
  },
} satisfies Record<NicheId, NicheCopy>;

const es = {
  index: {
    tag: 'Por rubro',
    /** Título de la columna de rubros en el pie. */
    footer: 'Rubros',
    h2: 'Hecho para tu rubro',
    sub: 'Lo que publicamos y respondemos cambia según tu negocio. Mira cómo se ve en el tuyo.',
  },
  labels: {
    pains: 'Lo que vemos',
    does: 'Qué hacemos',
    ideas: 'Ideas',
    offers: 'Precios',
    faq: 'Preguntas frecuentes',
    /** Antes de la lista de ideas en la respuesta «¿qué publicar?». */
    examples: 'Por ejemplo: ',
  },
  ctas: {
    whatsapp: 'Hablemos por WhatsApp',
    diy: 'Prefiero hacerlo yo',
    demo: 'Ver una demo de 15 minutos',
    serviceNote: (usd: string) => `USD ${usd} al mes · Partimos con una revisión de tus redes, sin costo`,
    newTab: '(se abre en una pestaña nueva)',
  },
  offers,
  faqService,
  faqPlatform,
  niches,
};

export default es;
export type NichesCopy = typeof es;
