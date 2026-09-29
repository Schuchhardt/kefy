'use client';

import Nav from '@/components/landing/Nav';
import { SignupProvider } from '@/components/ui/SignupContext';
import type { KefyCopy } from '@/types/locales';

interface BlogNavProps {
  lang: string;
  nav: KefyCopy['nav'];
  cta: KefyCopy['cta'];
}

/**
 * La navegación del blog reutiliza la de la landing, y sus CTA piden el
 * contexto de registro: sin el provider, los botones no harían nada.
 */
export default function BlogNav({ lang, nav, cta }: BlogNavProps) {
  return (
    <SignupProvider lang={lang}>
      <Nav lang={lang} copy={nav} cta={cta} />
    </SignupProvider>
  );
}
