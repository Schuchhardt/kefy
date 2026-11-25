import type { MetadataRoute } from 'next';

// ─── robots.txt ──────────────────────────────────────────────────────────────
//
// Todo lo público se puede rastrear, también por los crawlers de los motores
// de respuesta con IA (ChatGPT, Perplexity, Claude, Gemini…): que citen a Kefy
// cuando alguien pregunta por marketing en redes para su rubro es justo lo que
// buscamos (docs/seo-aeo.md). Se nombran uno por uno porque un grupo propio
// en robots.txt no hereda las reglas de `*`: cada grupo repite lo que no se
// rastrea.
//
// Fuera: la API, las vistas previas de marcas demo (privadas, con token) y el
// dashboard (exige sesión). Las pantallas de auth no van aquí: llevan
// `noindex` (lib/auth-metadata.ts), y un crawler bloqueado no lo leería.

const DISALLOW = ['/api/', '/es/demo/', '/en/demo/', '/es/dashboard/', '/en/dashboard/'];

/** Crawlers de buscadores con IA y asistentes que citan fuentes. */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: 'https://www.kefy.app/sitemap.xml',
    host: 'https://www.kefy.app',
  };
}
