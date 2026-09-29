import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'reset');
}

export default async function ResetPasswordPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  return (
    <AuthShell lang={lang} title={t.reset.subtitle}>
      <ResetPasswordForm lang={lang} token={firstParam(sp.token)} />
    </AuthShell>
  );
}
