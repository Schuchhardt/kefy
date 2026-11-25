// Aggregates landing-page copy per locale. Types live in `@/types/locales`.

import esLanding from '@/locales/es/landing';
import enLanding from '@/locales/en/landing';
import esNiches, { type NichesCopy } from '@/locales/es/niches';
import enNiches from '@/locales/en/niches';
import esSeo, { type SeoCopy, type HomeFaqContext } from '@/locales/es/seo';
import enSeo from '@/locales/en/seo';
import { MANAGED_SERVICE_PRICE_USD, PLAN_PRICES_USD, formatPlanNumber } from '@/lib/plans';
import { NICHE_IDS, NICHE_OFFER, type NicheId } from '@/lib/niches';
import type { FaqItem, KefyCopy } from '@/types/locales';

export const KEFY_COPY: Record<string, KefyCopy> = {
  es: esLanding,
  en: enLanding,
};

/** Landings por rubro y las dos ofertas (servicio / plataforma). */
export function nichesCopy(lang: string): NichesCopy {
  return lang === 'en' ? enNiches : esNiches;
}

/** Títulos de página, migas de pan y FAQ de la home (docs/seo-aeo.md). */
export function seoCopy(lang: string): SeoCopy {
  return lang === 'en' ? enSeo : esSeo;
}

/** Precios con el formato del idioma: servicio gestionado y plan más barato. */
function prices(lang: string) {
  return {
    service: formatPlanNumber(MANAGED_SERVICE_PRICE_USD, lang),
    platform: formatPlanNumber(PLAN_PRICES_USD.starter, lang),
  };
}

/** Pone en minúscula la primera letra, salvo siglas («API», «MCP»). */
function lowerFirst(text: string): string {
  return /^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/**
 * FAQ completa de un rubro, en el orden en que se muestra: las dos preguntas
 * de motor de respuesta (`aeo`), armadas con lo que ya dice la página; las
 * propias del rubro; y las comunes de su oferta, con los precios de lib/plans.ts.
 * La usan la página (y su FAQPage) y /llms.txt.
 */
export function nicheFaq(lang: string, id: NicheId): FaqItem[] {
  const copy = nichesCopy(lang);
  const niche = copy.niches[id];
  const p = prices(lang);
  const common = NICHE_OFFER[id] === 'service' ? copy.faqService : copy.faqPlatform;
  return [
    { q: niche.aeo.what, a: niche.does.items.map((i) => `${i.t}: ${lowerFirst(i.d)}`).join(' ') },
    { q: niche.aeo.post, a: `${copy.labels.examples}${niche.ideas.items.map(lowerFirst).join('; ')}.` },
    ...niche.faq,
    ...common.map((f) => ({ q: f.q, a: f.a(p.service, p.platform) })),
  ];
}

/** FAQ de la home con las respuestas resueltas. `service` marca la del servicio gestionado. */
export function homeFaq(lang: string): Array<FaqItem & { service: boolean }> {
  const landing = KEFY_COPY[lang] ?? KEFY_COPY.es;
  const niches = nichesCopy(lang);
  const list = (items: string[]) => new Intl.ListFormat(lang === 'en' ? 'en' : 'es', { type: 'conjunction' }).format(items);
  const ctx: HomeFaqContext = {
    ...prices(lang),
    channelCount: String(landing.channels.items.length),
    channels: list(landing.channels.items),
    niches: list(NICHE_IDS.map((id) => lowerFirst(niches.niches[id].name))),
  };
  return seoCopy(lang).faq.items.map((f) => ({ q: f.q, a: f.a(ctx), service: Boolean(f.service) }));
}
