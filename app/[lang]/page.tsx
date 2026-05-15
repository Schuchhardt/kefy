import { KEFY_COPY } from '@/lib/content';
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

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

  return (
    <>
      <Nav lang={lang} copy={copy.nav} />
      <main>
        <Hero lang={lang} copy={copy.hero} demoCopy={copy.demo} />
        <ProblemSection copy={copy.problem} />
        <HowSection copy={copy.how} />
        <MultSection copy={copy.mult} />
        <BrandSection copy={copy.brand} />
        <KillerSection copy={copy.killer} />
        <AutopilotSection copy={copy.autopilot} />
        <FeaturesGrid copy={copy.features} />
        <WhoSection copy={copy.who} />
        <ChannelsSection copy={copy.channels} />
        <ComparisonSection copy={copy.cmp} />
        <BilingualBand copy={copy.lang} />
        <PricingSection copy={copy.pricing} />
        <Testimonials copy={copy.testi} />
        <FinalCTA copy={copy.final} />
      </main>
      <Footer copy={copy.footer} />
    </>
  );
}
