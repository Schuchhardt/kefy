// ─── SEO y AEO: piezas comunes de las páginas públicas ───────────────────────
//
// Cada página pública declara título, descripción, canónica, hreflang y
// tarjetas para compartir con `pageMetadata`, y sus datos estructurados con
// los constructores de abajo (los pinta components/seo/JsonLd.tsx).
// Antes Sobre Kefy, el blog y los legales heredaban el título y la
// descripción de la home y no declaraban canónica. Ver docs/seo-aeo.md.

import type { Metadata } from 'next';
import { SITE_URL, shareMetadata } from '@/lib/share-metadata';

/**
 * Última revisión del contenido de las landings. Sale como `dateModified` en
 * los datos estructurados y en /llms.txt: los motores de respuesta favorecen
 * lo que dice cuándo se actualizó. Cámbiala cuando cambie la copy.
 */
export const CONTENT_UPDATED = '2026-11-24';

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

interface PageMetaInput {
  title: string;
  description: string;
  /** Ruta de la página en un idioma (`(l) => \`/${l}/sobre-kefy\``). */
  path: (lang: string) => string;
  /** false si la página no tiene versión en el otro idioma (un artículo del blog). */
  alternates?: boolean;
  image?: { url: string; alt: string; type?: string };
  type?: 'website' | 'article';
  publishedTime?: string;
}

export function pageMetadata(lang: string, input: PageMetaInput): Metadata {
  const { title, description, path, alternates = true, image } = input;
  const canonical = `${SITE_URL}${path(lang)}`;
  const share = shareMetadata(lang, { title, description, path: path(lang), image });
  return {
    title,
    description,
    alternates: {
      canonical,
      ...(alternates
        ? {
          languages: {
            es: `${SITE_URL}${path('es')}`,
            en: `${SITE_URL}${path('en')}`,
            'x-default': `${SITE_URL}${path('es')}`,
          },
        }
        : {}),
    },
    ...share,
    ...(input.type === 'article'
      ? { openGraph: { ...share.openGraph, type: 'article', publishedTime: input.publishedTime } }
      : {}),
  };
}

// ─── Datos estructurados (schema.org) ────────────────────────────────────────

export interface Crumb { name: string; url: string }

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

/** Preguntas frecuentes. Solo con preguntas que se ven en la página (lo exige Google). */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Página web con su idioma, de qué trata y cuándo se revisó. */
export function webPageJsonLd(input: {
  url: string;
  name: string;
  description: string;
  lang: string;
  type?: 'WebPage' | 'AboutPage' | 'CollectionPage' | 'FAQPage';
  image?: string;
  about?: Record<string, unknown>;
  audience?: string;
}) {
  return {
    '@type': input.type ?? 'WebPage',
    '@id': `${input.url}#webpage`,
    url: input.url,
    name: input.name,
    description: input.description,
    inLanguage: input.lang === 'en' ? 'en' : 'es',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORGANIZATION_ID },
    dateModified: CONTENT_UPDATED,
    ...(input.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: absolute(input.image) } } : {}),
    ...(input.about ? { about: input.about } : {}),
    ...(input.audience ? { audience: { '@type': 'BusinessAudience', audienceType: input.audience } } : {}),
  };
}

/** `@graph` con contexto, listo para JsonLd. */
export function graph(...nodes: Array<Record<string, unknown> | null | undefined | false>) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}

export function absolute(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
}

/**
 * JSON para un <script type="application/ld+json">. Escapa `<` para que un
 * texto con `</script>` (un título del blog, por ejemplo) no cierre la etiqueta.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
