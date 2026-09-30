import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import RegisterForm from '@/components/auth/RegisterForm';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import { safeNextPath } from '@/lib/safe-redirect';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'register');
}

// `?email=` lo manda la landing o la invitación; `?invitation=` convierte el
// registro en «unirse al equipo»; `?next=` es el destino tras crear la cuenta.
export default async function RegisterPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;
  const invitationToken = firstParam(sp.invitation);

  return (
    <AuthShell lang={lang} title={t.register.subtitle} width={440}>
      <RegisterForm
        lang={lang}
        next={safeNextPath(firstParam(sp.next), lang)}
        email={firstParam(sp.email)}
        invitationToken={invitationToken && /^[A-Za-z0-9_-]{16,256}$/.test(invitationToken) ? invitationToken : null}
      />
    </AuthShell>
  );
}
