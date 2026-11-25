// ─── /llms.txt ───────────────────────────────────────────────────────────────
//
// Resumen del sitio en Markdown para asistentes y motores de respuesta con IA
// (propuesta llms.txt: título, cita con el resumen, secciones con enlaces).
// Se arma con la misma copy de las páginas y los precios de lib/plans.ts, así
// que no puede contradecirlas. Primero en español (el mercado principal) y
// después en inglés. Ver docs/seo-aeo.md.

import { homeFaq, nichesCopy, seoCopy, KEFY_COPY } from '@/lib/content';
import { pricingPath } from '@/lib/localized-paths';
import { NICHE_IDS, nichePath } from '@/lib/niches';
import { MANAGED_SERVICE_PRICE_USD, PLAN_ORDER, PLAN_PRICES_USD, formatPlanNumber, planName } from '@/lib/plans';
import { CONTENT_UPDATED } from '@/lib/seo';
import { SITE_URL } from '@/lib/share-metadata';

function section(lang: 'es' | 'en'): string {
  const seo = seoCopy(lang);
  const niches = nichesCopy(lang);
  const landing = KEFY_COPY[lang];
  const num = (n: number) => formatPlanNumber(n, lang);
  const url = (path: string) => `${SITE_URL}${path}`;
  const plans = PLAN_ORDER.map((p) => `${planName(p, lang)} USD ${num(PLAN_PRICES_USD[p])}`).join(', ');
  const { service, platform } = niches.offers;

  return [
    `## ${seo.llms.offers}`,
    '',
    `- **${platform.title}** (${platform.label}): ${platform.from ? `${platform.from} ` : ''}${platform.price(num(PLAN_PRICES_USD.starter))}. ${platform.features.join('. ')}. ${landing.cta.note}. ${seo.llms.plans(plans)} [${seo.breadcrumb.pricing}](${url(pricingPath(lang))})`,
    `- **${service.title}** (${service.label}): ${service.price(num(MANAGED_SERVICE_PRICE_USD))}. ${service.features.join('. ')}. ${service.note}`,
    '',
    `## ${seo.llms.niches}`,
    '',
    ...NICHE_IDS.map((id) => `- [${niches.niches[id].name}](${url(nichePath(id, lang))}): ${niches.niches[id].card}`),
    '',
    `## ${seo.llms.faq}`,
    '',
    ...homeFaq(lang).flatMap((f) => [`### ${f.q}`, '', f.a, '']),
    `## ${seo.llms.pages}`,
    '',
    `- [${seo.llms.home}](${url(`/${lang}`)})`,
    `- [${seo.breadcrumb.blog}](${url(`/${lang}/blog`)}): ${seo.pages.blog.description}`,
    `- [${seo.pages.about.title.split(' | ')[0]}](${url(`/${lang}/sobre-kefy`)})`,
    '',
  ].join('\n');
}

export function buildLlmsTxt(): string {
  const es = seoCopy('es');
  return [
    '# Kefy',
    '',
    `> ${es.home.appDescription} ${es.home.serviceDescription}`,
    '',
    section('es'),
    '---',
    '',
    `> ${seoCopy('en').home.appDescription}`,
    '',
    section('en'),
    `${es.llms.updated}: ${CONTENT_UPDATED}`,
    '',
  ].join('\n');
}
