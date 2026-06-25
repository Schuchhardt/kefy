// /en/pricing redirects to the precios page with the correct lang param
// This page uses the same component as /es/precios
import PricingPage from '../precios/page';
export { generateStaticParams, generateMetadata } from '../precios/page';
export default PricingPage;
