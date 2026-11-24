import type { MetadataRoute } from 'next';
import { NICHE_IDS, nichePath } from '@/lib/niches';
import { pricingPath } from '@/lib/localized-paths';

const BASE_URL = 'https://www.kefy.app';
const LANGS = ['es', 'en'] as const;

type Entry = MetadataRoute.Sitemap[number];

/** Una entrada por idioma, con las alternativas de los dos. */
function localized(pathFor: (lang: string) => string, extra: Pick<Entry, 'changeFrequency' | 'priority'>): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [l, `${BASE_URL}${pathFor(l)}`]));
  return LANGS.map((lang) => ({
    url: `${BASE_URL}${pathFor(lang)}`,
    lastModified: new Date(),
    ...extra,
    alternates: { languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = ['', '/blog', '/sobre-kefy', '/privacidad', '/terminos', '/cookies'];

  return [
    ...staticPages.flatMap((page) => localized((l) => `/${l}${page}`, {
      changeFrequency: page === '' ? 'weekly' : 'monthly',
      priority: page === '' ? 1.0 : page === '/blog' ? 0.8 : 0.5,
    })),
    ...localized(pricingPath, { changeFrequency: 'monthly', priority: 0.8 }),
    // Landings por rubro (lib/niches.ts): slug distinto en cada idioma.
    ...NICHE_IDS.flatMap((id) => localized((l) => nichePath(id, l), { changeFrequency: 'monthly', priority: 0.8 })),
  ];
}
