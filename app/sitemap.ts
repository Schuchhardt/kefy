import type { MetadataRoute } from 'next';

const BASE_URL = 'https://kefy.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const langs = ['es', 'en'];
  const staticPages = ['', '/blog', '/sobre-kefy', '/privacidad', '/terminos', '/cookies'];

  return langs.flatMap((lang) =>
    staticPages.map((page) => ({
      url: `${BASE_URL}/${lang}${page}`,
      lastModified: new Date(),
      changeFrequency: page === '' ? ('weekly' as const) : ('monthly' as const),
      priority: page === '' ? 1.0 : page === '/blog' ? 0.8 : 0.5,
      alternates: {
        languages: Object.fromEntries(langs.map((l) => [l, `${BASE_URL}/${l}${page}`])),
      },
    }))
  );
}
