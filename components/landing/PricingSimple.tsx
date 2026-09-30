'use client';

// Precios resumidos de la home. Antes era un componente propio que duplicaba
// las tarjetas de /precios; ahora es PricingSection en modo `compact` (una
// sola implementación, auditoría UX 2.4).

import PricingSection from './PricingSection';
import type { KefyCopy } from '@/types/locales';

export default function PricingSimple({ copy, cta, lang }: {
  copy: KefyCopy['pricing'];
  cta: KefyCopy['cta'];
  lang: string;
}) {
  return <PricingSection copy={copy} cta={cta} lang={lang} compact />;
}
