import type { MetadataRoute } from 'next';
import { NICHE_IDS, nicheImage, nichePath } from '@/lib/niches';
import { pricingPath } from '@/lib/localized-paths';
import { CONTENT_UPDATED, absolute } from '@/lib/seo';
import { createSupabaseServer } from '@/lib/supabase';

const BASE_URL = 'https://www.kefy.app';
const LANGS = ['es', 'en'] as const;

// Se regenera cada hora: así entran los artículos nuevos del blog.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

/**
 * Una entrada por idioma, con las alternativas de los dos. `lastModified` es
 * la fecha real de la última revisión de la copy (lib/seo.ts), no la del build:
 * una fecha que cambia en cada despliegue no le dice nada útil a un buscador.
 */
function localized(
  pathFor: (lang: string) => string,
  extra: Pick<Entry, 'changeFrequency' | 'priority' | 'images'>,
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [l, `${BASE_URL}${pathFor(l)}`]));
  return LANGS.map((lang) => ({
    url: `${BASE_URL}${pathFor(lang)}`,
    lastModified: CONTENT_UPDATED,
    ...extra,
    alternates: { languages },
  }));
}

/** Artículos publicados del blog (cada idioma tiene los suyos). Sin base, ninguno. */
async function blogEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data } = await createSupabaseServer()
      .from('kefy_blog_posts')
      .select('slug, lang, published_at, cover_url');
    return (data ?? []).map((post: { slug: string; lang: string; published_at: string; cover_url: string | null }) => ({
      url: `${BASE_URL}/${post.lang}/blog/${post.slug}`,
      lastModified: post.published_at,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
      ...(post.cover_url ? { images: [absolute(post.cover_url)] } : {}),
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const legal = ['/privacidad', '/terminos', '/cookies'];

  return [
    ...localized((l) => `/${l}`, {
      changeFrequency: 'weekly',
      priority: 1.0,
      images: NICHE_IDS.map((id) => absolute(nicheImage(id).hero)),
    }),
    ...localized(pricingPath, { changeFrequency: 'monthly', priority: 0.8 }),
    // Landings por rubro (lib/niches.ts): slug distinto en cada idioma.
    ...NICHE_IDS.flatMap((id) => localized((l) => nichePath(id, l), {
      changeFrequency: 'monthly',
      priority: 0.8,
      images: [absolute(nicheImage(id).hero), absolute(nicheImage(id).ideas)],
    })),
    ...localized((l) => `/${l}/blog`, { changeFrequency: 'weekly', priority: 0.7 }),
    ...(await blogEntries()),
    ...localized((l) => `/${l}/sobre-kefy`, { changeFrequency: 'monthly', priority: 0.5 }),
    ...legal.flatMap((page) => localized((l) => `/${l}${page}`, { changeFrequency: 'yearly', priority: 0.3 })),
  ];
}
