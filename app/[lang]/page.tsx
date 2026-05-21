import { KEFY_COPY } from '@/lib/content';
import { WaitlistProvider } from '@/components/ui/WaitlistContext';
import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import ProblemSection from '@/components/landing/ProblemSection';
import HowSection from '@/components/landing/HowSection';
import BrandSection from '@/components/landing/BrandSection';
import KillerSection from '@/components/landing/KillerSection';
import AutopilotSection from '@/components/landing/AutopilotSection';
import AutoEngageSection from '@/components/landing/AutoEngageSection';
import StrategySection from '@/components/landing/StrategySection';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import WhoSection from '@/components/landing/WhoSection';
import ChannelsSection from '@/components/landing/ChannelsSection';
import ComparisonSection from '@/components/landing/ComparisonSection';
import BilingualBand from '@/components/landing/BilingualBand';
import PricingSection from '@/components/landing/PricingSection';
import Testimonials from '@/components/landing/Testimonials';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';

const BASE_URL = 'https://kefy.app';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];
  const isEs = lang === 'es';

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
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: isEs ? 'Plan gratuito disponible' : 'Free plan available' },
        description: isEs
          ? 'Kefy unifica generación de texto, imagen, video, programación, analytics y ads en una sola plataforma para startups, pymes y tiendas online.'
          : 'Kefy unifies text, image, video generation, scheduling, analytics and ads in one platform for startups, SMBs and online stores.',
      },
    ],
  };

  return (
    <WaitlistProvider copy={copy.waitlist}>
      {/* Force dark theme for the landing page regardless of user preference */}
      <div data-theme="dark">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Nav lang={lang} copy={copy.nav} />

      <main>
        <Hero lang={lang} copy={copy.hero} demoCopy={copy.demo} />

        <ProblemSection copy={copy.problem} />
        <HowSection copy={copy.how} />

        <BrandSection copy={copy.brand} />

        <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(138,92,255,0.13) 0%, transparent 60%), #08080A' }}>
          <KillerSection copy={copy.killer} />
        </div>

        <AutopilotSection copy={copy.autopilot} />

        <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(168,85,247,0.11) 0%, transparent 60%), #08080A' }}>
          <AutoEngageSection copy={copy.engage} />
        </div>

        <StrategySection copy={copy.strategy} />
        <FeaturesGrid copy={copy.features} />
        <WhoSection copy={copy.who} />
        <ChannelsSection copy={copy.channels} />
        <ComparisonSection copy={copy.cmp} />
        <BilingualBand copy={copy.lang} />

        <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.08) 0%, transparent 60%), #08080A' }}>
          <PricingSection copy={copy.pricing} />
        </div>

        <Testimonials copy={copy.testi} />

        <div style={{ position: 'relative', background: 'radial-gradient(ellipse at top, rgba(198,255,75,0.09) 0%, rgba(255,140,66,0.06) 40%, transparent 70%), #08080A' }}>
          <FinalCTA copy={copy.final} />
        </div>
      </main>

      <Footer copy={copy.footer} lang={lang} />
      </div>
    </WaitlistProvider>
  );
}
