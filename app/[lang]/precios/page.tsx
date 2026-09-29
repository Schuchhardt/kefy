import { KEFY_COPY } from '@/lib/content';
import { SignupProvider } from '@/components/ui/SignupContext';
import Nav from '@/components/landing/Nav';
import PricingSection from '@/components/landing/PricingSection';
import Footer from '@/components/landing/Footer';
import { pricingPath } from '@/lib/localized-paths';
import type { Metadata } from 'next';

// Página completa de precios. Un slug por idioma: /es/precios y /en/pricing
// (app/[lang]/pricing reexporta esta página; next.config.ts redirige el slug
// del otro idioma). Antes /en/pricing servía esto pero todos los enlaces
// internos construían /en/precios.

const BASE_URL = 'https://www.kefy.app';

export function generateStaticParams() {
  return [{ lang: 'es' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isEs = lang !== 'en';
  const title = isEs ? 'Precios — Kefy' : 'Pricing — Kefy';
  const description = isEs
    ? 'Planes desde US$49 al mes con 30 días gratis para empezar, sin tarjeta. Sin contrato: cancela cuando quieras.'
    : 'Plans from US$49 a month with 30 free days to start, no card. No contract: cancel anytime.';
  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}${pricingPath(lang)}`,
      languages: {
        es: `${BASE_URL}${pricingPath('es')}`,
        en: `${BASE_URL}${pricingPath('en')}`,
        'x-default': `${BASE_URL}${pricingPath('es')}`,
      },
    },
    openGraph: { title, description, url: `${BASE_URL}${pricingPath(lang)}` },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

  return (
    <SignupProvider lang={lang}>
      <div data-theme="dark">
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
