import { test, expect } from '@playwright/test';

// ─── Lo que ve un crawler (docs/seo-aeo.md) ──────────────────────────────────
//
// Se pide el HTML con `request`, sin navegador: así lo ven Bing y los crawlers
// de los motores de respuesta con IA, que no ejecutan JavaScript. Antes el
// <html> salía sin `lang` (lo ponía un componente en el navegador) y Sobre
// Kefy, el blog y los legales repetían el título de la home sin canónica.

const PAGES: Array<{ path: string; lang: 'es' | 'en'; jsonLd: string[] }> = [
  { path: '/es', lang: 'es', jsonLd: ['Organization', 'SoftwareApplication', 'Service', 'ItemList', 'FAQPage'] },
  { path: '/en', lang: 'en', jsonLd: ['Organization', 'FAQPage'] },
  { path: '/es/para/clinicas-dentales', lang: 'es', jsonLd: ['WebPage', 'BreadcrumbList', 'Service', 'FAQPage'] },
  { path: '/en/for/marketing-agencies', lang: 'en', jsonLd: ['WebPage', 'BreadcrumbList', 'SoftwareApplication', 'FAQPage'] },
  { path: '/es/precios', lang: 'es', jsonLd: ['BreadcrumbList', 'SoftwareApplication', 'FAQPage'] },
  { path: '/es/sobre-kefy', lang: 'es', jsonLd: ['AboutPage', 'BreadcrumbList'] },
  { path: '/en/terminos', lang: 'en', jsonLd: ['WebPage', 'BreadcrumbList'] },
  { path: '/es/blog', lang: 'es', jsonLd: ['Blog', 'BreadcrumbList'] },
];

function attr(html: string, re: RegExp): string | null {
  return re.exec(html)?.[1] ?? null;
}

for (const page of PAGES) {
  test(`${page.path}: lang, título propio, canónica, hreflang y JSON-LD en el HTML`, async ({ request }) => {
    const res = await request.get(page.path);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(attr(html, /<html[^>]*\slang="([^"]+)"/)).toBe(page.lang);
    expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(`https://www.kefy.app${page.path}`);
    expect(html).toMatch(/<link rel="alternate" hrefLang="es"/);
    expect(html).toMatch(/<link rel="alternate" hrefLang="en"/);
    expect(attr(html, /<meta name="description" content="([^"]+)"/)?.length ?? 0).toBeGreaterThan(50);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const types = blocks.flatMap((b) => (b['@graph'] ?? [b]).map((n: { '@type': string }) => n['@type']));
    for (const type of page.jsonLd) expect(types, page.path).toContain(type);
  });
}

test('cada página pública tiene su propio título', async ({ request }) => {
  const titles = await Promise.all(PAGES.map(async (p) => attr(await (await request.get(p.path)).text(), /<title>([^<]+)<\/title>/)));
  expect(new Set(titles).size).toBe(titles.length);
});

test('/llms.txt resume el sitio en Markdown', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  const txt = await res.text();
  expect(txt.startsWith('# Kefy')).toBe(true);
  expect(txt).toContain('https://www.kefy.app/es/para/clinicas-dentales');
});

test('robots.txt deja pasar a los crawlers de IA y publica el sitemap', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).toContain('User-Agent: GPTBot');
  expect(txt).toContain('Sitemap: https://www.kefy.app/sitemap.xml');
});

test('sitemap.xml lista las landings por rubro con sus imágenes', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('<loc>https://www.kefy.app/es/para/clinicas-dentales</loc>');
  expect(xml).toContain('https://www.kefy.app/landing/niches/dental-ideas.webp');
});
