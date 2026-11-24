import type { Metadata } from 'next';
import { KEFY_COPY, nichesCopy } from '@/lib/content';
import { SignupProvider } from '@/components/ui/SignupContext';
import { PLAN_ORDER, PLAN_PRICES_USD, TRIAL_DAYS } from '@/lib/plans';
import { pricingPath } from '@/lib/localized-paths';
import { shareMetadata } from '@/lib/share-metadata';
import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import HowSection from '@/components/landing/HowSection';
import OffersSection from '@/components/landing/OffersSection';
import NicheGrid from '@/components/landing/NicheGrid';
import Testimonials from '@/components/landing/Testimonials';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';

const BASE_URL = 'https://www.kefy.app';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return {
    alternates: {
      canonical: `${BASE_URL}/${lang}`,
      languages: {
        es: `${BASE_URL}/es`,
        en: `${BASE_URL}/en`,
        'x-default': `${BASE_URL}/es`,
      },
    },
    ...shareMetadata(lang, { path: `/${lang}` }),
  };
}

// Seis secciones: demo → cómo funciona → las dos ofertas (plataforma o «lo
// hacemos nosotros») → rubros → redes y prueba → CTA final.
//
// Antes eran ocho (problema, marca, piloto automático y precios resumidos):
// la marca y el piloto automático caben en los tres pasos de «Cómo funciona»,
// el problema se cuenta mejor por rubro (cada landing de rubro trae el suyo) y
// los planes viven en /precios. Lo que faltaba era el servicio gestionado, que
// es lo que venden los correos SDR. Ver docs/landings-por-rubro.md y, para la
// reducción anterior (de catorce a ocho), docs/auditoria-ux.md, Sprint 2.

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];
  const niches = nichesCopy(lang);
  const isEs = lang !== 'en';

  // Datos estructurados con el precio real. Antes declaraban `price: '0'` y
  // «Plan gratuito disponible»: no hay plan gratuito, hay un mes de prueba.
  const offers = PLAN_ORDER.map((plan) => ({
    '@type': 'Offer',
    name: plan.charAt(0).toUpperCase() + plan.slice(1),
    price: String(PLAN_PRICES_USD[plan]),
    priceCurrency: 'USD',
    url: `${BASE_URL}${pricingPath(lang)}`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: String(PLAN_PRICES_USD[plan]),
      priceCurrency: 'USD',
      unitCode: 'MON',
      billingDuration: 'P1M',
    },
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${BASE_URL}/#organization`,
        name: 'Kefy',
        url: BASE_URL,
        logo: { '@type': 'ImageObject', url: `${BASE_URL}/apple-touch-icon.png` },
        sameAs: [
          'https://x.com/kefy.app',
          'https://linkedin.com/company/kefy-app',
          'https://instagram.com/kefy.app',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${BASE_URL}/#website`,
        url: `${BASE_URL}/${lang}`,
        name: 'Kefy',
        publisher: { '@id': `${BASE_URL}/#organization` },
        inLanguage: isEs ? 'es' : 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${BASE_URL}/#app`,
        name: 'Kefy',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: String(PLAN_PRICES_USD.starter),
          highPrice: String(PLAN_PRICES_USD.business),
          priceCurrency: 'USD',
          offerCount: String(PLAN_ORDER.length),
          offers,
          description: isEs
            ? `Planes mensuales desde US$${PLAN_PRICES_USD.starter}. Todas las cuentas empiezan con ${TRIAL_DAYS} días gratis del plan Starter, sin tarjeta.`
            : `Monthly plans from US$${PLAN_PRICES_USD.starter}. Every account starts with ${TRIAL_DAYS} free days of the Starter plan, no card required.`,
        },
        description: isEs
          ? 'Kefy crea publicaciones con tu marca (posts, carruseles, reels y stories) y las publica en tus redes sociales. Tú las apruebas o activas el piloto automático.'
          : 'Kefy creates on-brand posts, carousels, reels and stories and publishes them to your social networks. You approve them or turn on autopilot.',
      },
    ],
  };

  return (
    <SignupProvider lang={lang}>
      {/* La landing es siempre oscura, sea cual sea el tema del dashboard. */}
      <div data-theme="dark">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <Nav lang={lang} copy={copy.nav} cta={copy.cta} />

        <main>
          <Hero lang={lang} copy={copy.hero} cta={copy.cta} demoCopy={copy.demo} />
          <HowSection copy={copy.how} />

          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.08) 0%, transparent 60%), #08080A' }}>
            <OffersSection
              copy={niches}
              variant="platform-first"
              whatsapp={niches.offers.whatsapp}
              lang={lang}
              more={{ href: pricingPath(lang), label: copy.pricing.compareAll }}
            />
          </div>

          <NicheGrid copy={niches} lang={lang} />
          <Testimonials copy={copy.testi} channels={copy.channels} />

          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.09) 0%, rgba(255,140,66,0.06) 40%, transparent 70%), #08080A' }}>
            <FinalCTA copy={copy.final} cta={copy.cta} />
          </div>
        </main>

        <Footer copy={copy.footer} lang={lang} />
      </div>
    </SignupProvider>
  );
}
