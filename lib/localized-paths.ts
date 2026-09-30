// ─── Rutas con slug distinto por idioma ──────────────────────────────────────
//
// Casi todas las páginas usan el mismo slug en los dos idiomas, salvo precios
// (/es/precios y /en/pricing) e invitaciones (/es/invitacion y
// /en/invitation). next.config.ts redirige el slug del otro idioma.
//
// El selector de idioma de la landing usaba siempre /es o /en a secas: desde
// /es/precios se perdía la página. Con esto va a la misma página en el otro
// idioma.

const LOCALIZED_SLUGS: Array<Record<'es' | 'en', string>> = [
  { es: 'precios', en: 'pricing' },
  { es: 'invitacion', en: 'invitation' },
];

/** Slug de una página localizada en el idioma pedido (`pricingSlug('en')` → 'pricing'). */
export function localizedSlug(slugEs: 'precios' | 'invitacion', lang: string): string {
  const entry = LOCALIZED_SLUGS.find((s) => s.es === slugEs)!;
  return lang === 'en' ? entry.en : entry.es;
}

/** Ruta de la página de precios del idioma. */
export function pricingPath(lang: string): string {
  return `/${lang}/${localizedSlug('precios', lang)}`;
}

/**
 * La misma ruta en otro idioma: cambia el prefijo y, si el primer segmento es
 * un slug localizado, lo traduce. Conserva query y hash.
 */
export function switchLocalePath(pathname: string, targetLang: 'es' | 'en', suffix = ''): string {
  const segments = pathname.split('/');
  // segments[0] es '' (la ruta empieza por '/'), segments[1] el idioma.
  if (segments.length < 2 || !segments[1]) return `/${targetLang}${suffix}`;
  segments[1] = targetLang;
  if (segments[2]) {
    const entry = LOCALIZED_SLUGS.find((s) => s.es === segments[2] || s.en === segments[2]);
    if (entry) segments[2] = entry[targetLang];
  }
  return `${segments.join('/')}${suffix}`;
}
