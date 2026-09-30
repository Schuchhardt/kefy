// /en/pricing: la misma página que /es/precios (un slug por idioma; ver
// lib/localized-paths.ts). /es/pricing y /en/precios redirigen en
// next.config.ts.
import PricingPage from '../precios/page';

export { generateMetadata } from '../precios/page';

export function generateStaticParams() {
  return [{ lang: 'en' }];
}

export default PricingPage;
