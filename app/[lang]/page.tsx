import type { Metadata } from 'next';
import { KEFY_COPY, homeFaq, nichesCopy, seoCopy } from '@/lib/content';
import { SignupProvider } from '@/components/ui/SignupContext';
import JsonLd from '@/components/seo/JsonLd';
import { MANAGED_SERVICE_PRICE_USD, PLAN_ORDER, PLAN_PRICES_USD, TRIAL_DAYS, planName } from '@/lib/plans';
import { pricingPath } from '@/lib/localized-paths';
import { NICHE_IDS, nicheImage, nichePath } from '@/lib/niches';
import { SALES_EMAIL } from '@/lib/contact';
import { SITE_URL } from '@/lib/share-metadata';
import { ORGANIZATION_ID, WEBSITE_ID, absolute, faqJsonLd, graph, pageMetadata, webPageJsonLd } from '@/lib/seo';
import esCommon from '@/locales/es/common';
import enCommon from '@/locales/en/common';
import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import HowSection from '@/components/landing/HowSection';
import OffersSection from '@/components/landing/OffersSection';
import NicheGrid from '@/components/landing/NicheGrid';
import Testimonials from '@/components/landing/Testimonials';
import FaqList from '@/components/landing/FaqList';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';

function commonMeta(lang: string) {
  return (lang === 'en' ? enCommon : esCommon).metadata;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const { title, description } = commonMeta(lang);
  return pageMetadata(lang, { title, description, path: (l) => `/${l}` });
}

// Siete secciones: demo → cómo funciona → las dos ofertas (plataforma o «lo
// hacemos nosotros») → rubros → redes y prueba → preguntas frecuentes → CTA final.
//
// Antes eran ocho (problema, marca, piloto automático y precios resumidos):
// la marca y el piloto automático caben en los tres pasos de «Cómo funciona»,
// el problema se cuenta mejor por rubro (cada landing de rubro trae el suyo) y
// los planes viven en /precios. Lo que faltaba era el servicio gestionado, que
// es lo que venden los correos SDR. Las preguntas frecuentes están para los
// motores de respuesta (docs/seo-aeo.md). Ver docs/landings-por-rubro.md y,
// para la reducción anterior, docs/auditoria-ux.md, Sprint 2.

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];
  const niches = nichesCopy(lang);
  const seo = seoCopy(lang);
  const faq = homeFaq(lang);
  const url = `${SITE_URL}/${lang}`;
  const { title, description } = commonMeta(lang);

  // Datos estructurados con el precio real. Antes declaraban `price: '0'` y
  // «Plan gratuito disponible»: no hay plan gratuito, hay un mes de prueba.
  const offers = PLAN_ORDER.map((plan) => ({
    '@type': 'Offer',
    name: planName(plan, lang),
    price: String(PLAN_PRICES_USD[plan]),
    priceCurrency: 'USD',
    url: `${SITE_URL}${pricingPath(lang)}`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: String(PLAN_PRICES_USD[plan]),
      priceCurrency: 'USD',
      unitCode: 'MON',
      billingDuration: 'P1M',
    },
  }));

  const jsonLd = graph(
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: 'Kefy',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/apple-touch-icon.png` },
      description: seo.home.appDescription,
      areaServed: ['CL', 'LATAM'],
      contactPoint: { '@type': 'ContactPoint', contactType: 'sales', email: SALES_EMAIL, availableLanguage: ['es', 'en'] },
      sameAs: [
        'https://x.com/kefy.app',
        'https://linkedin.com/company/kefy-app',
        'https://instagram.com/kefy.app',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url,
      name: 'Kefy',
      publisher: { '@id': ORGANIZATION_ID },
      inLanguage: lang === 'en' ? 'en' : 'es',
    },
    webPageJsonLd({ url, name: title, description, lang, about: { '@id': `${SITE_URL}/#app` } }),
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Kefy',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: seo.home.appDescription,
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: String(PLAN_PRICES_USD.starter),
        highPrice: String(PLAN_PRICES_USD.business),
        priceCurrency: 'USD',
        offerCount: String(PLAN_ORDER.length),
        offers,
        description: seo.home.offersDescription(String(PLAN_PRICES_USD.starter), String(TRIAL_DAYS)),
      },
    },
    {
      '@type': 'Service',
      '@id': `${SITE_URL}/#service`,
      name: seo.home.serviceName,
      description: seo.home.serviceDescription,
      provider: { '@id': ORGANIZATION_ID },
      areaServed: 'CL',
      offers: { '@type': 'Offer', price: String(MANAGED_SERVICE_PRICE_USD), priceCurrency: 'USD' },
    },
    // Las landings por rubro, como lista: los motores de respuesta ven a qué
    // rubros sirve Kefy y dónde está la página de cada uno.
    {
      '@type': 'ItemList',
      name: seo.home.nichesName,
      itemListElement: NICHE_IDS.map((id, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: niches.niches[id].name,
        url: `${SITE_URL}${nichePath(id, lang)}`,
        image: absolute(nicheImage(id).hero),
      })),
    },
    faqJsonLd(faq),
  );

  return (
    <SignupProvider lang={lang}>
      {/* La landing es siempre oscura, sea cual sea el tema del dashboard. */}
      <div data-theme="dark">
        <JsonLd data={jsonLd} />

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

          <section className="section home-faq" id="faq" aria-labelledby="faq-title">
            <div className="container">
              <div className="section-head reveal">
                <span className="label">{seo.faq.tag}</span>
                <h2 id="faq-title" className="h2">{seo.faq.h2}</h2>
              </div>
              {/* Cerradas: en la home la FAQ es para quien busca algo puntual (y
                  para los motores de respuesta, que leen el HTML igual). */}
              <FaqList items={faq} openFirst={false} />
            </div>
          </section>

          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.09) 0%, rgba(255,140,66,0.06) 40%, transparent 70%), #08080A' }}>
            <FinalCTA copy={copy.final} cta={copy.cta} />
          </div>
        </main>

        <Footer copy={copy.footer} lang={lang} />
      </div>
    </SignupProvider>
  );
}
