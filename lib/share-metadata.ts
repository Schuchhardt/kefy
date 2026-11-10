// ─── Metadatos para compartir (Open Graph / X) ───────────────────────────────
//
// Next reemplaza `openGraph` y `twitter` enteros cuando una página los define:
// no los fusiona con los del layout. Por eso precios perdía la imagen, el tipo
// y el nombre del sitio, y su tarjeta de X mostraba el título de la home.
// Toda página que quiera su propio título al compartirse usa esta función, que
// devuelve los dos bloques completos.
//
// La imagen sale de app/[lang]/opengraph-image.tsx (1200×630, una por idioma).
// Se declara aquí a mano porque, en cuanto una página define `openGraph`, Next
// deja de heredarle la imagen del archivo.

import type { Metadata } from 'next';
import esCommon from '@/locales/es/common';
import enCommon from '@/locales/en/common';

export const SITE_URL = 'https://www.kefy.app';

const commonCopy = { es: esCommon, en: enCommon };

function common(lang: string) {
  return (commonCopy[lang as 'es' | 'en'] ?? commonCopy.es).metadata;
}

/** URL de la imagen OG del idioma (la ruta que genera opengraph-image.tsx). */
export function ogImageUrl(lang: string): string {
  const l = lang === 'en' ? 'en' : 'es';
  return `${SITE_URL}/${l}/opengraph-image/default`;
}

export function shareMetadata(
  lang: string,
  { title, description, path }: { title?: string; description?: string; path?: string } = {},
): Pick<Metadata, 'openGraph' | 'twitter'> {
  const c = common(lang);
  const t = title ?? c.title;
  const d = description ?? c.description;
  const image = { url: ogImageUrl(lang), width: 1200, height: 630, alt: c.title, type: 'image/png' };

  return {
    openGraph: {
      type: 'website',
      siteName: 'Kefy',
      locale: c.ogLocale,
      title: t,
      description: d,
      // Sin `path` no hay og:url: Facebook usa la URL compartida. Ponerla por
      // defecto hacía que todo link se atribuyera a la home.
      ...(path ? { url: `${SITE_URL}${path}` } : {}),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@kefyapp',
      creator: '@kefyapp',
      title: t,
      description: d,
      images: [image],
    },
  };
}
