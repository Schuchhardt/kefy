// ─── Rubros con landing propia ───────────────────────────────────────────────
//
// Cada rubro al que se le escribe en frío (correos SDR desde email@kefy.app)
// tiene su página: /es/para/clinicas-dentales, /en/for/dental-clinics… El id
// es el sufijo de la campaña de los correos (`utm_campaign=sdr_dental`), así
// que un correo ya enviado que apunta a la home con esa campaña aterriza en la
// página de su rubro (ver `nicheRedirectPath` y proxy.ts).
//
// Aquí solo viven ids, slugs y la oferta principal: sin dependencias, porque
// lo importa el proxy (runtime edge). La copy está en locales/*/niches.ts.
// Ver docs/landings-por-rubro.md.

import type { Locale } from '@/types/i18n';

export const NICHE_IDS = [
  'dental',
  'estetica',
  'fitness',
  'academias',
  'turismo',
  'hogar',
  'agencias',
] as const;

export type NicheId = (typeof NICHE_IDS)[number];

/**
 * Qué se vende primero en la página. Los correos a clínicas, estudios,
 * institutos, alojamientos y empresas del hogar ofrecen que Kefy les lleve las
 * redes (`service`); a las agencias se les ofrece la plataforma para atender
 * más clientes con el mismo equipo (`platform`).
 */
export type NicheOffer = 'service' | 'platform';

export const NICHE_OFFER: Record<NicheId, NicheOffer> = {
  dental: 'service',
  estetica: 'service',
  fitness: 'service',
  academias: 'service',
  turismo: 'service',
  hogar: 'service',
  agencias: 'platform',
};

/** Primer segmento de la ruta en cada idioma: /es/para/…, /en/for/… */
export const NICHE_SEGMENT: Record<Locale, string> = { es: 'para', en: 'for' };

export const NICHE_SLUGS: Record<NicheId, Record<Locale, string>> = {
  dental: { es: 'clinicas-dentales', en: 'dental-clinics' },
  estetica: { es: 'clinicas-esteticas', en: 'aesthetic-clinics' },
  fitness: { es: 'estudios-de-pilates-yoga-y-fitness', en: 'pilates-yoga-and-fitness-studios' },
  academias: { es: 'institutos-y-academias', en: 'schools-and-academies' },
  turismo: { es: 'alojamientos-turisticos', en: 'vacation-rentals-and-lodges' },
  hogar: { es: 'proyectos-para-el-hogar', en: 'home-improvement' },
  agencias: { es: 'agencias-de-marketing', en: 'marketing-agencies' },
};

export function isNicheId(value: unknown): value is NicheId {
  return typeof value === 'string' && (NICHE_IDS as readonly string[]).includes(value);
}

function asLocale(lang: string): Locale {
  return lang === 'en' ? 'en' : 'es';
}

/** Ruta de la página de un rubro en un idioma: `/es/para/clinicas-dentales`. */
export function nichePath(id: NicheId, lang: string): string {
  const l = asLocale(lang);
  return `/${l}/${NICHE_SEGMENT[l]}/${NICHE_SLUGS[id][l]}`;
}

/** El rubro de un slug, en cualquiera de los dos idiomas (null si no existe). */
export function nicheFromSlug(slug: string): NicheId | null {
  const found = NICHE_IDS.find((id) => NICHE_SLUGS[id].es === slug || NICHE_SLUGS[id].en === slug);
  return found ?? null;
}

/** `sdr_dental` → `dental`. Cualquier otra campaña → null. */
export function nicheFromCampaign(campaign: string | null | undefined): NicheId | null {
  const match = /^sdr_([a-z]+)$/.exec(campaign?.trim().toLowerCase() ?? '');
  return match && isNicheId(match[1]) ? match[1] : null;
}

/**
 * Los correos enviados antes de que existieran estas páginas enlazan a la home
 * con `utm_campaign=sdr_<rubro>`. Si la ruta es la home (`/`, `/es`, `/en`) y
 * la campaña es de un rubro, devuelve la ruta de su página; si no, null.
 * `fallbackLang` es el idioma que se usaría para `/` sin prefijo.
 */
export function nicheRedirectPath(pathname: string, campaign: string | null, fallbackLang: string): string | null {
  const id = nicheFromCampaign(campaign);
  if (!id) return null;
  const home = /^\/(?:(es|en)\/?)?$/.exec(pathname);
  if (!home) return null;
  return nichePath(id, home[1] ?? fallbackLang);
}

/**
 * La misma página de rubro en el otro idioma, para el selector de idioma.
 * Recibe los segmentos de la ruta sin el idioma (`['para', 'clinicas-dentales']`)
 * y devuelve los traducidos, o null si no es una página de rubro.
 */
export function translateNicheSegments(segments: string[], target: Locale): string[] | null {
  const [segment, slug, ...rest] = segments;
  if (segment !== NICHE_SEGMENT.es && segment !== NICHE_SEGMENT.en) return null;
  const id = slug ? nicheFromSlug(slug) : null;
  if (!id) return null;
  return [NICHE_SEGMENT[target], NICHE_SLUGS[id][target], ...rest];
}
