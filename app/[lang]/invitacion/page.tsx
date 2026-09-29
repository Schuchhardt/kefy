import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import InvitationView from '@/components/auth/InvitationView';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

// /es/invitacion y /en/invitation (alias en app/[lang]/invitation/page.tsx).
// Antes era una página suelta, sin logo ni fondo, distinta del resto de auth.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'invitation');
}

export default async function InvitationPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  return (
    <AuthShell lang={lang} title={t.invitation.title}>
      <InvitationView lang={lang} token={firstParam(sp.token)} />
    </AuthShell>
  );
}
