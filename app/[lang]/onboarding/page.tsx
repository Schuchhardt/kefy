import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { authMetadata } from '@/lib/auth-metadata';
import esCopy from '@/locales/es/onboarding';
import enCopy from '@/locales/en/onboarding';

// /{lang}/onboarding: primera pantalla tras crear la cuenta (proxy.ts exige
// sesión). Antes era un `router.replace` vacío al dashboard, sin nada que
// mostrar sin JavaScript; ahora es el paso «pega tu web → 3 posts».

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'onboarding');
}

export default async function OnboardingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = lang === 'en' ? enCopy : esCopy;

  return (
    <AuthShell lang={lang} title={t.title} width={620}>
      <noscript>
        <p className="auth-banner">
          {t.noScript} <a href={`/${lang}/dashboard`}>{t.goDashboard}</a>
        </p>
      </noscript>
      <OnboardingFlow lang={lang} />
    </AuthShell>
  );
}
