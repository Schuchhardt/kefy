import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'forgot');
}

export default async function ForgotPasswordPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  return (
    <AuthShell lang={lang} title={t.forgot.subtitle}>
      <ForgotPasswordForm lang={lang} email={firstParam(sp.email)} />
    </AuthShell>
  );
}
