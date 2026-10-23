import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import OAuthConsentView from '@/components/auth/OAuthConsentView';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

// Consentimiento OAuth del servidor MCP: es el `authorization_endpoint` que
// anuncia /.well-known/oauth-authorization-server (proxy.ts añade el idioma).
// proxy.ts exige sesión aquí y, sin ella, manda al login con `?next=`. Ver
// lib/assistant/oauth.ts.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'oauth');
}

export default async function OAuthAuthorizePage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  // La query tal cual: la valida /api/oauth/consent, aquí solo se reenvía.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = firstParam(v);
    if (value !== null) query.set(k, value);
  }

  return (
    <AuthShell lang={lang} title={t.oauth.title} width={460}>
      <OAuthConsentView lang={lang} query={query.toString()} />
    </AuthShell>
  );
}
