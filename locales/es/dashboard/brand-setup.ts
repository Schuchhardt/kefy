// «Completa tu marca»: el Brand Kit en 5 pantallas (components/dashboard/
// BrandKitWizard.tsx, lib/brand-setup.ts). Las etiquetas de cada campo son las
// de ./brand.ts, para que el wizard y las páginas de Mi marca digan lo mismo.

const es = {
  title: 'Completa tu marca',
  subtitle: 'Cuanto más sepa Kefy de tu marca, más se parecerá a ti lo que escriba. Son 5 pantallas y puedes dejarlo para después.',
  stepsNav: 'Pantallas para completar tu marca',
  stepOf: (current: number, total: number, name: string) => `Paso ${current} de ${total}: ${name}`,
  steps: {
    business: 'Tu negocio',
    voice: 'Tu voz',
    look: 'Tu imagen',
    audience: 'Tu público',
    difference: 'Tu diferencia',
  },
  intros: {
    business: 'Lo básico: cómo te llamas y qué haces. Si tienes web, Kefy puede leerla y proponerte los datos.',
    voice: 'Cómo hablas con tus clientes. Kefy escribe con este tono.',
    look: 'Colores, tipografías y logo para las imágenes y los carruseles.',
    audience: 'A quién le hablas y dónde está.',
    difference: 'Qué te distingue. Sirve para que los posts no suenen como los de cualquiera.',
  },
  statusDone: 'completo',
  statusPending: 'pendiente',
  prev: 'Anterior',
  next: 'Guardar y seguir',
  finish: 'Guardar y terminar',
  later: 'Terminar más tarde',
  saving: 'Guardando…',
  saved: 'Guardado',
  loading: 'Cargando tu marca…',
  loadError: 'No pudimos cargar tu marca.',
  retry: 'Reintentar',
  suggest: (field: string) => `Sugerir ${field.toLowerCase()} con IA (1 crédito)`,
  suggestShort: 'Sugerir con IA · 1 crédito',
  suggestionsTitle: 'Sugerencias',
  noSuggestions: 'Esta vez no encontramos sugerencias.',
  website: {
    placeholder: 'https://tunegocio.com',
    read: 'Leer mi web · 1 crédito',
    reading: 'Leyendo tu web…',
    found: 'Esto es lo que encontramos en tu web. Revisa antes de usarlo:',
    apply: 'Usar estos datos',
    discard: 'Descartar',
    applied: 'Datos aplicados. Revísalos y guarda.',
    empty: 'No encontramos datos útiles en esa web.',
    error: 'No pudimos leer esa web. Revisa la dirección o completa los datos a mano.',
  },
  socialOptional: 'Añadir tus redes sociales (opcional)',
  socialPlaceholder: 'https://…',
  emojisYes: 'Sí, uso emojis',
  emojisNo: 'No uso emojis',
  companySize: (size: string) => `${size} personas`,
  languages: { es: 'Español', en: 'English', pt: 'Português', fr: 'Français' },
  errors: {
    fix: 'Revisa los campos marcados.',
    save: 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
    forbidden: 'Solo el dueño o un administrador de la organización puede editar la marca.',
    suggestions: 'No pudimos traer sugerencias. Inténtalo de nuevo.',
    plans: 'Ver planes',
  },
};

export default es;
export type BrandSetupCopy = typeof es;
