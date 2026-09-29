// Primeros pasos tras crear la cuenta: «pega tu web o describe tu negocio →
// 3 posts» (app/[lang]/onboarding, lib/services/onboarding.ts).
//
// Sustituye al modal «Bienvenido» y al wizard de 20 pasos como primera
// pantalla: la landing promete ver publicaciones hechas para ti en menos de un
// minuto y antes hacían falta más de 25 interacciones.

const es = {
  title: 'Veamos cómo se vería tu negocio en redes',
  intro: 'Pega tu web o cuéntanos en una frase qué haces. Kefy escribirá 3 publicaciones con tu marca en menos de un minuto.',
  urlLabel: 'Web de tu negocio',
  urlPlaceholder: 'tunegocio.com',
  urlHint: 'Leemos tu web para sacar el nombre, el tono, los colores y el logo.',
  or: 'o',
  descriptionLabel: 'Tu negocio en una frase',
  descriptionPlaceholder: 'Ej.: Pastelería vegana con despacho a domicilio en Santiago',
  cost: (credits: number) => `Usa unos ${credits} créditos.`,
  costRemaining: (credits: number, remaining: number) =>
    `Usa unos ${credits} créditos (te quedan ${remaining} este mes).`,
  submit: 'Crear mis 3 posts',
  skip: 'Saltar por ahora',
  noScript: 'Esta pantalla necesita JavaScript. Puedes ir directamente al dashboard.',
  goDashboard: 'Ir al dashboard',
  working: {
    title: 'Creando tus posts…',
    readingWeb: 'Leyendo tu web',
    writing: 'Escribiendo 3 posts con tu voz',
    images: 'Creando las imágenes',
    hint: 'Suele tardar menos de un minuto. No cierres esta pestaña.',
  },
  done: {
    title: 'Tus primeros 3 posts',
    intro: 'Son borradores: puedes editarlos, pedir otra versión o publicarlos cuando conectes tus redes.',
    angles: {
      intro: 'Presentación',
      tip: 'Consejo útil',
      benefit: 'Por qué elegirte',
    },
    imageLoading: 'Creando imagen…',
    imageError: 'No se pudo crear la imagen.',
    imageRetry: 'Crear imagen',
    imageAlt: (angle: string) => `Imagen del post «${angle}»`,
    edit: 'Editar',
    connectTitle: 'Publícalos en tus redes',
    connectBody: 'Conecta Instagram (u otra red) y publica o programa estos posts desde su detalle.',
    connect: 'Conectar Instagram',
    otherNetworks: 'Otras redes',
    completeBrand: 'Completar mi marca',
    goDashboard: 'Ir al dashboard',
    websiteFailed: 'No pudimos leer tu web, así que usamos tu descripción.',
    partial: (failed: number) =>
      failed === 1
        ? 'Uno de los posts no se pudo crear. Puedes crear más desde «Crear contenido».'
        : `${failed} posts no se pudieron crear. Puedes crear más desde «Crear contenido».`,
    filled: (n: number) =>
      n === 1 ? 'Guardamos 1 dato de tu marca.' : `Guardamos ${n} datos de tu marca.`,
  },
  errors: {
    empty: 'Pega tu web o describe tu negocio en una frase.',
    generic: 'No se pudieron crear los posts. Inténtalo de nuevo.',
    network: 'Error de red. Revisa tu conexión e inténtalo de nuevo.',
    plans: 'Ver planes',
  },
};

export default es;
export type OnboardingCopy = typeof es;
