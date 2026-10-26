import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import AccessForm from '@/components/auth/AccessForm';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import { safeNextPath } from '@/lib/safe-redirect';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'access');
}

// Entrada única desde la landing: el email decide si es login o registro.
// `?email=` lo manda el hero; `?next=` es el destino tras entrar.
export default async function AccessPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  return (
    <AuthShell lang={lang} title={t.access.subtitle}>
      <AccessForm
        lang={lang}
        next={safeNextPath(firstParam(sp.next), lang)}
        email={firstParam(sp.email)}
      />
    </AuthShell>
  );
}
