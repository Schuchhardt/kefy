import { KEFY_COPY } from '@/lib/content';
import { WaitlistProvider } from '@/components/ui/WaitlistContext';
import Nav from '@/components/landing/Nav';
import PricingSection from '@/components/landing/PricingSection';
import Footer from '@/components/landing/Footer';
import { locales } from '@/lib/i18n';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isEs = lang === 'es';
  return {
    title: isEs ? 'Precios — Kefy' : 'Pricing — Kefy',
    description: isEs
      ? 'Planes simples para que tu negocio siempre tenga redes activas. Sin contrato. Cancela cuando quieras.'
      : 'Simple plans to keep your business social media active. No contract. Cancel anytime.',
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
    <WaitlistProvider copy={copy.waitlist}>
      <div data-theme="dark">
        <Nav lang={lang} copy={copy.nav} />
        <main style={{ paddingTop: '5rem' }}>
          <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.08) 0%, transparent 60%), #08080A', minHeight: '100vh' }}>
            <PricingSection copy={copy.pricing} />
          </div>
        </main>
        <Footer copy={copy.footer} lang={lang} />
      </div>
    </WaitlistProvider>
  );
}
