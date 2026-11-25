import { describe, it, expect, vi } from 'vitest';

// El sitemap lee los artículos del blog: aquí, una base con dos.
vi.mock('@/lib/supabase', () => ({
  createSupabaseServer: () => ({
    from: () => ({
      select: async () => ({
        data: [
          { slug: 'ideas-para-clinicas', lang: 'es', published_at: '2026-11-01', cover_url: 'https://cdn.test/a.jpg' },
          { slug: 'ideas-for-clinics', lang: 'en', published_at: '2026-11-02', cover_url: null },
        ],
      }),
    }),
  }),
}));

import { homeFaq, nicheFaq, nichesCopy } from '@/lib/content';
import { buildLlmsTxt } from '@/lib/llms';
import { NICHE_IDS, nichePath } from '@/lib/niches';
import { MANAGED_SERVICE_PRICE_USD, PLAN_PRICES_USD } from '@/lib/plans';
import { CONTENT_UPDATED, breadcrumbJsonLd, faqJsonLd, pageMetadata, serializeJsonLd } from '@/lib/seo';
import robots, { AI_CRAWLERS } from '@/app/robots';
import sitemap from '@/app/sitemap';
import esLanding from '@/locales/es/landing';
import { promesasEn } from '../helpers/landing-promises';

// SEO y AEO de las páginas públicas (docs/seo-aeo.md).

const PRECIOS_VALIDOS = new Set([MANAGED_SERVICE_PRICE_USD, ...Object.values(PLAN_PRICES_USD)]);
const preciosEn = (t: string) => [...t.matchAll(/USD\s*(\d+)/g)].map((m) => Number(m[1]));

describe('lib/seo', () => {
  it('pageMetadata declara canónica, hreflang y tarjetas para compartir', () => {
    const meta = pageMetadata('en', { title: 'T', description: 'D', path: (l) => `/${l}/sobre-kefy` });
    expect(meta.alternates?.canonical).toBe('https://www.kefy.app/en/sobre-kefy');
    expect(meta.alternates?.languages).toEqual({
      es: 'https://www.kefy.app/es/sobre-kefy',
      en: 'https://www.kefy.app/en/sobre-kefy',
      'x-default': 'https://www.kefy.app/es/sobre-kefy',
    });
    expect(meta.openGraph?.url).toBe('https://www.kefy.app/en/sobre-kefy');
    expect(meta.title).toBe('T');
  });

  it('sin versión en el otro idioma solo hay canónica', () => {
    const meta = pageMetadata('es', { title: 'T', description: 'D', path: (l) => `/${l}/blog/x`, alternates: false });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it('las imágenes para compartir salen con URL absoluta', () => {
    const meta = pageMetadata('es', {
      title: 'T', description: 'D', path: (l) => `/${l}`, image: { url: '/landing/niches/dental-og.jpg', alt: 'a' },
    });
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0].url).toBe('https://www.kefy.app/landing/niches/dental-og.jpg');
  });

  // Un título del blog con «</script>» no puede cerrar la etiqueta del JSON-LD.
  it('el JSON-LD escapa «<»', () => {
    const out = serializeJsonLd({ headline: 'a </script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).headline).toBe('a </script><script>alert(1)</script>');
  });

  it('migas de pan y FAQ con la forma de schema.org', () => {
    expect(breadcrumbJsonLd([{ name: 'Inicio', url: 'u1' }, { name: 'X', url: 'u2' }]).itemListElement[1]).toEqual({
      '@type': 'ListItem', position: 2, name: 'X', item: 'u2',
    });
    expect(faqJsonLd([{ q: '¿?', a: 'Sí.' }]).mainEntity[0].acceptedAnswer.text).toBe('Sí.');
  });

  it('CONTENT_UPDATED es una fecha ISO', () => {
    expect(CONTENT_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe.each(['es', 'en'] as const)('preguntas frecuentes (%s)', (lang) => {
  it('la home: respuestas completas, precios de lib/plans.ts y el total de redes', () => {
    const faq = homeFaq(lang);
    expect(faq.length).toBeGreaterThanOrEqual(6);
    for (const f of faq) {
      expect(f.a, f.q).not.toMatch(/undefined|NaN|\$\{/);
      for (const p of preciosEn(f.a)) expect(PRECIOS_VALIDOS.has(p), `USD ${p} en «${f.q}»`).toBe(true);
    }
    expect(faq.map((f) => f.a).join(' ')).toContain(String(esLanding.channels.items.length));
  });

  // La plataforma no tiene UI de anuncios: solo la respuesta del servicio
  // gestionado (que los lleva el equipo) puede nombrarlos.
  it('la home: las respuestas sobre la plataforma no prometen lo que no existe', () => {
    const plataforma = homeFaq(lang).filter((f) => !f.service).flatMap((f) => [f.q, f.a]);
    expect(promesasEn(plataforma)).toEqual([]);
  });

  it('cada rubro abre con sus dos preguntas de buscador, armadas con lo que dice la página', () => {
    const copy = nichesCopy(lang);
    for (const id of NICHE_IDS) {
      const faq = nicheFaq(lang, id);
      const n = copy.niches[id];
      expect(faq[0].q).toBe(n.aeo.what);
      expect(faq[1].q).toBe(n.aeo.post);
      for (const item of n.does.items) expect(faq[0].a, id).toContain(item.t);
      for (const idea of n.ideas.items) expect(faq[1].a.toLowerCase(), id).toContain(idea.slice(1).toLowerCase());
      for (const f of faq) {
        expect(f.q.trim().endsWith('?'), `${id}: ${f.q}`).toBe(true);
        expect(f.a, f.q).not.toMatch(/undefined|NaN/);
      }
      // Sin preguntas repetidas: cada una es una entrada del FAQPage.
      expect(new Set(faq.map((f) => f.q)).size).toBe(faq.length);
    }
  });
});

describe('/llms.txt', () => {
  const txt = buildLlmsTxt();

  it('empieza con el título y el resumen (formato llms.txt)', () => {
    expect(txt.startsWith('# Kefy\n\n> ')).toBe(true);
  });

  it('enlaza todas las landings por rubro en los dos idiomas, y precios', () => {
    for (const id of NICHE_IDS) {
      expect(txt).toContain(`https://www.kefy.app${nichePath(id, 'es')}`);
      expect(txt).toContain(`https://www.kefy.app${nichePath(id, 'en')}`);
    }
    expect(txt).toContain('https://www.kefy.app/es/precios');
    expect(txt).toContain('https://www.kefy.app/en/pricing');
  });

  it('los precios son los de lib/plans.ts y dice cuándo se actualizó', () => {
    const precios = preciosEn(txt);
    expect(precios).toContain(MANAGED_SERVICE_PRICE_USD);
    expect(precios).toContain(PLAN_PRICES_USD.starter);
    for (const p of precios) expect(PRECIOS_VALIDOS.has(p), `USD ${p}`).toBe(true);
    expect(txt).toContain(CONTENT_UPDATED);
    expect(txt).not.toMatch(/undefined|NaN/);
  });
});

describe('robots.txt', () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];

  it('deja rastrear lo público y bloquea API, demos y dashboard', () => {
    for (const rule of rules) {
      expect(rule.allow).toBe('/');
      expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/es/dashboard/', '/es/demo/']));
      // Las pantallas de auth llevan noindex: bloquearlas impediría leerlo.
      expect(JSON.stringify(rule.disallow)).not.toMatch(/login|register|access/);
    }
  });

  it('nombra a los crawlers de los motores de respuesta con las mismas reglas', () => {
    const ai = rules.find((rule) => Array.isArray(rule.userAgent));
    expect(ai?.userAgent).toEqual(AI_CRAWLERS);
    expect(AI_CRAWLERS).toEqual(expect.arrayContaining(['GPTBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']));
  });
});

describe('sitemap.xml', () => {
  it('incluye home, precios, rubros, blog, artículos, sobre Kefy y legales en los dos idiomas', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of ['/es', '/en', '/es/precios', '/en/pricing', '/es/blog', '/en/sobre-kefy', '/es/terminos', '/en/cookies']) {
      expect(urls, path).toContain(`https://www.kefy.app${path}`);
    }
    for (const id of NICHE_IDS) {
      expect(urls).toContain(`https://www.kefy.app${nichePath(id, 'es')}`);
      expect(urls).toContain(`https://www.kefy.app${nichePath(id, 'en')}`);
    }
    expect(urls).toContain('https://www.kefy.app/es/blog/ideas-para-clinicas');
    expect(urls).toContain('https://www.kefy.app/en/blog/ideas-for-clinics');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('las páginas de rubro llevan sus imágenes', async () => {
    const entry = (await sitemap()).find((e) => e.url === `https://www.kefy.app${nichePath('dental', 'es')}`);
    expect(entry?.images).toEqual([
      'https://www.kefy.app/landing/niches/dental.webp',
      'https://www.kefy.app/landing/niches/dental-ideas.webp',
    ]);
  });
});
