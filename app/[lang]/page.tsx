import { KEFY_COPY } from '@/lib/content';
import { WaitlistProvider } from '@/components/ui/WaitlistContext';
import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import ProblemSection from '@/components/landing/ProblemSection';
import HowSection from '@/components/landing/HowSection';
import MultSection from '@/components/landing/MultSection';
import BrandSection from '@/components/landing/BrandSection';
import KillerSection from '@/components/landing/KillerSection';
import AutopilotSection from '@/components/landing/AutopilotSection';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import WhoSection from '@/components/landing/WhoSection';
import ChannelsSection from '@/components/landing/ChannelsSection';
import ComparisonSection from '@/components/landing/ComparisonSection';
import BilingualBand from '@/components/landing/BilingualBand';
import PricingSection from '@/components/landing/PricingSection';
import Testimonials from '@/components/landing/Testimonials';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';
import BendsSection from '@/components/ui/BendsSection';

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
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Nav lang={lang} copy={copy.nav} />

      <main>
        {/* Hero — verdes accent, rotación diagonal */}
        <BendsSection
          colors={['#C6FF4B', '#8AB833', '#0d1f00', '#08080A']}
          rotation={135}
          speed={0.13}
          warpStrength={0.9}
          intensity={1.3}
          overlay="rgba(8, 8, 10, 0.72)"
        >
          <Hero lang={lang} copy={copy.hero} demoCopy={copy.demo} />
        </BendsSection>

        <ProblemSection copy={copy.problem} />
        <HowSection copy={copy.how} />

        {/* MultSection — acento cálido + verde, rotación horizontal */}
        <BendsSection
          colors={['#FF8C42', '#C6FF4B', '#1a0a00', '#08080A']}
          rotation={0}
          speed={0.1}
          warpStrength={1.1}
          frequency={0.8}
          intensity={1.2}
          overlay="rgba(8, 8, 10, 0.76)"
        >
          <MultSection copy={copy.mult} />
        </BendsSection>

        <BrandSection copy={copy.brand} />

        {/* KillerSection — morado + verde, rotación vertical */}
        <BendsSection
          colors={['#8a5cff', '#C6FF4B', '#0a0010', '#08080A']}
          rotation={270}
          speed={0.11}
          warpStrength={1.2}
          bandWidth={5}
          intensity={1.4}
          overlay="rgba(8, 8, 10, 0.80)"
        >
          <KillerSection copy={copy.killer} />
        </BendsSection>

        <AutopilotSection copy={copy.autopilot} />
        <FeaturesGrid copy={copy.features} />
        <WhoSection copy={copy.who} />
        <ChannelsSection copy={copy.channels} />
        <ComparisonSection copy={copy.cmp} />
        <BilingualBand copy={copy.lang} />

        {/* PricingSection — verde+cálido, rotación oblicua */}
        <BendsSection
          colors={['#C6FF4B', '#FF8C42', '#001a00', '#08080A']}
          rotation={60}
          speed={0.14}
          warpStrength={0.8}
          frequency={1.2}
          intensity={1.35}
          overlay="rgba(8, 8, 10, 0.75)"
        >
          <PricingSection copy={copy.pricing} />
        </BendsSection>

        <Testimonials copy={copy.testi} />

        {/* FinalCTA — más vibrante, rotación suave */}
        <BendsSection
          colors={['#C6FF4B', '#8AB833', '#FF8C42', '#08080A']}
          rotation={45}
          speed={0.16}
          warpStrength={1.3}
          iterations={2}
          intensity={1.5}
          overlay="rgba(8, 8, 10, 0.70)"
        >
          <FinalCTA copy={copy.final} />
        </BendsSection>
      </main>

      <Footer copy={copy.footer} lang={lang} />
    </WaitlistProvider>
  );
}
