import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  NICHE_IDS, NICHE_OFFER, NICHE_SLUGS, OFFER_IMAGES, nicheFromCampaign, nicheFromSlug, nicheImage, nichePath,
  nicheRedirectPath,
} from '@/lib/niches';
import { switchLocalePath } from '@/lib/localized-paths';
import { MANAGED_SERVICE_PRICE_USD, PLAN_LIMITS, PLAN_PRICES_USD } from '@/lib/plans';
import { whatsappHref } from '@/lib/contact';
import esNiches from '@/locales/es/niches';
import enNiches from '@/locales/en/niches';
import esLanding from '@/locales/es/landing';
import enLanding from '@/locales/en/landing';
import { ANUNCIOS, PROMESAS_PROHIBIDAS, promesasEn, textos } from '../helpers/landing-promises';

// Landings por rubro (docs/landings-por-rubro.md). El id de cada rubro es el
// sufijo de la campaña de los correos SDR (utm_campaign=sdr_<id>): si cambia,
// los correos ya enviados dejan de llegar a su página.

describe('lib/niches: rutas', () => {
  it('los ids son los de las campañas SDR', () => {
    expect([...NICHE_IDS]).toEqual(['dental', 'estetica', 'fitness', 'academias', 'turismo', 'hogar', 'agencias']);
  });

  it('cada slug es único, en minúsculas y sin caracteres raros', () => {
    const slugs = NICHE_IDS.flatMap((id) => [NICHE_SLUGS[id].es, NICHE_SLUGS[id].en]);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('ruta por idioma y vuelta desde el slug', () => {
    expect(nichePath('dental', 'es')).toBe('/es/para/clinicas-dentales');
    expect(nichePath('dental', 'en')).toBe('/en/for/dental-clinics');
    for (const id of NICHE_IDS) {
      expect(nicheFromSlug(NICHE_SLUGS[id].es)).toBe(id);
      expect(nicheFromSlug(NICHE_SLUGS[id].en)).toBe(id);
    }
    expect(nicheFromSlug('no-existe')).toBeNull();
  });

  it('la campaña de un correo da su rubro', () => {
    expect(nicheFromCampaign('sdr_dental')).toBe('dental');
    expect(nicheFromCampaign(' SDR_Turismo ')).toBe('turismo');
    expect(nicheFromCampaign('sdr_restaurantes')).toBeNull();
    expect(nicheFromCampaign('dental')).toBeNull();
    expect(nicheFromCampaign(null)).toBeNull();
  });

  it('solo la home con una campaña de rubro se redirige', () => {
    expect(nicheRedirectPath('/', 'sdr_dental', 'es')).toBe('/es/para/clinicas-dentales');
    expect(nicheRedirectPath('/', 'sdr_dental', 'en')).toBe('/en/for/dental-clinics');
    expect(nicheRedirectPath('/en', 'sdr_hogar', 'es')).toBe('/en/for/home-improvement');
    expect(nicheRedirectPath('/es/', 'sdr_hogar', 'en')).toBe('/es/para/proyectos-para-el-hogar');
    expect(nicheRedirectPath('/es/precios', 'sdr_dental', 'es')).toBeNull();
    expect(nicheRedirectPath('/es', 'newsletter', 'es')).toBeNull();
    expect(nicheRedirectPath('/es', null, 'es')).toBeNull();
  });

  // Las imágenes las deja scripts/optimize-niche-images.mjs en public/. Un
  // rubro nuevo sin imagen rompería el hero y la tarjeta de la home.
  it('cada rubro tiene su imagen y su imagen para compartir', () => {
    for (const id of NICHE_IDS) {
      for (const file of Object.values(nicheImage(id))) {
        expect(existsSync(join(process.cwd(), 'public', file)), file).toBe(true);
      }
    }
    for (const file of Object.values(OFFER_IMAGES)) {
      expect(existsSync(join(process.cwd(), 'public', file)), file).toBe(true);
    }
  });

  it('el selector de idioma lleva a la misma página de rubro', () => {
    expect(switchLocalePath('/es/para/clinicas-dentales', 'en')).toBe('/en/for/dental-clinics');
    expect(switchLocalePath('/en/for/marketing-agencies', 'es')).toBe('/es/para/agencias-de-marketing');
    // Lo demás sigue igual.
    expect(switchLocalePath('/es/precios', 'en')).toBe('/en/pricing');
    expect(switchLocalePath('/es/para/no-existe', 'en')).toBe('/en/para/no-existe');
  });
});

describe('lib/contact: WhatsApp', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('lleva el primer mensaje escrito', () => {
    const href = new URL(whatsappHref('Hola, tengo una clínica dental'));
    expect(href.origin).toBe('https://wa.me');
    expect(href.searchParams.get('text')).toBe('Hola, tengo una clínica dental');
  });

  it('NEXT_PUBLIC_SALES_WHATSAPP cambia el número (solo dígitos)', () => {
    vi.stubEnv('NEXT_PUBLIC_SALES_WHATSAPP', '+56 9 1111 2222');
    expect(whatsappHref('x')).toMatch(/^https:\/\/wa\.me\/56911112222\?/);
  });
});

describe.each([['es', esNiches, esLanding], ['en', enNiches, enLanding]] as const)('locales/%s/niches', (lang, copy, landing) => {
  it('cada rubro tiene su copy completa', () => {
    for (const id of NICHE_IDS) {
      const n = copy.niches[id];
      expect(n.pains.items, id).toHaveLength(3);
      expect(n.does.items, id).toHaveLength(3);
      expect(n.ideas.items, id).toHaveLength(6);
      expect(n.faq.length, id).toBeGreaterThanOrEqual(2);
      expect(n.whatsapp.trim(), id).not.toBe('');
      expect(n.image.alt.trim(), id).not.toBe('');
      expect(n.image.ideasAlt.trim(), id).not.toBe('');
    }
  });

  // Lo que se ve en Google: el título se corta pasados ~70 caracteres y la
  // descripción pasados ~160.
  it('títulos y descripciones caben en un resultado de búsqueda', () => {
    for (const id of NICHE_IDS) {
      const { title, description } = copy.niches[id].meta;
      expect(title.length, `${id}: ${title}`).toBeLessThanOrEqual(80);
      expect(description.length, `${id}: ${description}`).toBeLessThanOrEqual(170);
    }
  });

  // La plataforma no tiene UI de anuncios: ni la tarjeta de la plataforma ni
  // la página de agencias (que vende la plataforma) pueden prometerlos. El
  // servicio gestionado sí los incluye: los lleva el equipo.
  it('la plataforma no promete anuncios ni nada que no exista', () => {
    const plataforma = [
      ...textos(copy.offers.platform),
      ...textos(copy.offers.agency),
      ...NICHE_IDS.filter((id) => NICHE_OFFER[id] === 'platform').flatMap((id) => textos(copy.niches[id])),
    ];
    expect(promesasEn(plataforma)).toEqual([]);
  });

  it('el resto de la copy tampoco promete descuentos anuales, white-label ni plan gratuito', () => {
    const resto = PROMESAS_PROHIBIDAS.filter((p) => p !== ANUNCIOS);
    expect(promesasEn(textos(copy), resto)).toEqual([]);
  });

  // Los precios escritos a mano (descripciones para Google) tienen que ser los
  // de lib/plans.ts.
  it('todo precio en USD es uno de los de lib/plans.ts', () => {
    const validos = new Set([MANAGED_SERVICE_PRICE_USD, ...Object.values(PLAN_PRICES_USD)]);
    const precios = textos(copy).flatMap((t) => [...t.matchAll(/USD\s*(\d+)/g)].map((m) => Number(m[1])));
    expect(precios.length).toBeGreaterThan(0);
    for (const p of precios) expect(validos.has(p), `USD ${p}`).toBe(true);
  });

  it('la oferta de la plataforma usa el CTA y la nota únicos de la landing', () => {
    expect(copy.offers.platform.cta).toBe(landing.cta.label);
    expect(copy.offers.platform.note).toBe(landing.cta.note);
    expect(copy.offers.agency.note).toBe(landing.cta.note);
    expect(copy.offers.agency.proCta).toBe(landing.cta.label);
  });

  it('la página de agencias dice los mismos números que el producto', () => {
    const agencias = textos(copy.niches.agencias).join(' | ');
    expect(agencias).toContain(`${landing.channels.items.length} ${lang === 'en' ? 'networks' : 'redes'}`);
    expect(agencias).toContain(`${PLAN_LIMITS.business.members} ${lang === 'en' ? 'team members' : 'miembros del equipo'}`);
  });

  it('las preguntas con precio responden con los de lib/plans.ts', () => {
    const respuestas = [...copy.faqService, ...copy.faqPlatform].map((f) => f.a('200', '49')).join(' ');
    expect(respuestas).toContain('USD 200');
    expect(respuestas).toContain('USD 49');
  });
});
