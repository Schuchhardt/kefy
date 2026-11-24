// Lógica común de las dos rutas de una landing de rubro: /es/para/<slug>
// (app/[lang]/para/[niche]) y /en/for/<slug> (app/[lang]/for/[niche]).
// Un slug por idioma, como precios: cualquier combinación que no sea la
// canónica (/en/para/clinicas-dentales, /es/para/dental-clinics…) redirige a
// la buena. Ver lib/niches.ts y docs/landings-por-rubro.md.

import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { nichesCopy } from '@/lib/content';
import { NICHE_IDS, NICHE_SEGMENT, NICHE_SLUGS, nicheImage, nichePath, nicheFromSlug } from '@/lib/niches';
import { SITE_URL, shareMetadata } from '@/lib/share-metadata';
import type { Locale } from '@/types/i18n';
import NicheLanding from './NicheLanding';

export interface NicheRouteParams { lang: string; niche: string }

/** Páginas que se generan en el build: las canónicas del idioma de la ruta. */
export function nicheStaticParams(lang: Locale): NicheRouteParams[] {
  return NICHE_IDS.map((id) => ({ lang, niche: NICHE_SLUGS[id][lang] }));
}

export function nicheMetadata({ lang, niche }: NicheRouteParams): Metadata {
  const id = nicheFromSlug(niche);
  if (!id) return {};
  const copy = nichesCopy(lang).niches[id];
  const { title, description } = copy.meta;
  const path = nichePath(id, lang);
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${path}`,
      languages: {
        es: `${SITE_URL}${nichePath(id, 'es')}`,
        en: `${SITE_URL}${nichePath(id, 'en')}`,
        'x-default': `${SITE_URL}${nichePath(id, 'es')}`,
      },
    },
    // Al compartir el enlace (WhatsApp, redes) se ve la foto del rubro.
    ...shareMetadata(lang, { title, description, path, image: { url: nicheImage(id).og, alt: copy.image.alt } }),
  };
}

export function renderNichePage({ lang, niche }: NicheRouteParams, segment: string) {
  const id = nicheFromSlug(niche);
  if (!id) notFound();
  const canonical = nichePath(id, lang);
  if (`/${lang}/${segment}/${niche}` !== canonical) permanentRedirect(canonical);
  return <NicheLanding id={id} lang={lang} />;
}

export { NICHE_SEGMENT };
