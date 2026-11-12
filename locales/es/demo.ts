// Vista previa pública de una marca demo (app/[lang]/demo/[token]): lo que ve
// un prospecto cuando el dueño de Kefy le manda el link
// (lib/services/admin/demo-brands.ts).

const es = {
  metaTitle: 'Vista previa privada — Kefy',
  metaDescription: 'Publicaciones de ejemplo hechas con Kefy a partir de la web del negocio.',
  badge: 'Vista previa privada',
  title: (brand: string) => `Así se vería ${brand} en redes`,
  intro: 'Kefy leyó tu web y escribió estas publicaciones con tu marca: tu nombre, tu tono y tus colores. Son borradores de ejemplo y no se publicaron en ningún lado.',
  postsTitle: 'Publicaciones de ejemplo',
  postLabel: (n: number) => `Publicación ${n}`,
  empty: 'Todavía no hay publicaciones en esta vista previa.',
  expires: (date: string) => `Este link vence el ${date}.`,
  ctaTitle: '¿Te gustaría tener esto todas las semanas?',
  ctaText: 'Kefy crea, programa y publica el contenido de tu negocio. Puedes usar la plataforma tú mismo o dejar que nosotros gestionemos tus cuentas.',
  ctaContact: 'Hablar con nosotros',
  ctaLearn: 'Conocer Kefy',
  footer: 'Hecho con Kefy',
  notFoundTitle: 'Este link ya no está disponible',
  notFoundText: 'La vista previa venció o fue desactivada. Pide un link nuevo a quien te la envió.',
};

export default es;
export type DemoCopy = typeof es;
