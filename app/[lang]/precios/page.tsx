import { KEFY_COPY, seoCopy } from '@/lib/content';
import { SignupProvider } from '@/components/ui/SignupContext';
import Nav from '@/components/landing/Nav';
import PricingSection from '@/components/landing/PricingSection';
import Footer from '@/components/landing/Footer';
import JsonLd from '@/components/seo/JsonLd';
import { pricingPath } from '@/lib/localized-paths';
import { PLAN_ORDER, PLAN_PRICES_USD, planName } from '@/lib/plans';
import { SITE_URL } from '@/lib/share-metadata';
import { breadcrumbJsonLd, faqJsonLd, graph, pageMetadata, webPageJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';

// Página completa de precios. Un slug por idioma: /es/precios y /en/pricing
// (app/[lang]/pricing reexporta esta página; next.config.ts redirige el slug
// del otro idioma). Antes /en/pricing servía esto pero todos los enlaces
// internos construían /en/precios.

export function generateStaticParams() {
  return [{ lang: 'es' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const { title, description } = seoCopy(lang).pages.pricing;
  return pageMetadata(lang, { title, description, path: pricingPath });
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];
  const seo = seoCopy(lang);
  const url = `${SITE_URL}${pricingPath(lang)}`;

  // Planes, migas de pan y las preguntas frecuentes que se ven en la página.
  const jsonLd = graph(
    webPageJsonLd({ url, name: seo.pages.pricing.title, description: seo.pages.pricing.description, lang }),
    breadcrumbJsonLd([
      { name: seo.breadcrumb.home, url: `${SITE_URL}/${lang}` },
      { name: seo.breadcrumb.pricing, url },
    ]),
    {
      '@type': 'SoftwareApplication',
      name: 'Kefy',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url,
      offers: PLAN_ORDER.map((plan) => ({
        '@type': 'Offer',
        name: planName(plan, lang),
        price: String(PLAN_PRICES_USD[plan]),
        priceCurrency: 'USD',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(PLAN_PRICES_USD[plan]), priceCurrency: 'USD', unitCode: 'MON' },
      })),
    },
    faqJsonLd(copy.pricing.faq.map((f) => ({ q: f.q, a: f.a }))),
  );

  return (
    <SignupProvider lang={lang}>
      <div data-theme="dark">
        <JsonLd data={jsonLd} />
        <Nav lang={lang} copy={copy.nav} cta={copy.cta} />
        <main style={{ paddingTop: '5rem' }}>
          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.08) 0%, transparent 60%), #08080A', minHeight: '100vh' }}>
            <PricingSection copy={copy.pricing} cta={copy.cta} lang={lang} />
          </div>
        </main>
        <Footer copy={copy.footer} lang={lang} />
      </div>
    </SignupProvider>
  );
}
