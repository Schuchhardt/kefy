import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import LoginForm from '@/components/auth/LoginForm';
import { authMetadata, firstParam } from '@/lib/auth-metadata';
import { safeNextPath } from '@/lib/safe-redirect';
import { localizedSlug } from '@/lib/localized-paths';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return authMetadata(lang, 'login');
}

// Los parámetros se leen en el servidor y llegan al formulario como props:
// antes el formulario usaba useSearchParams dentro de un <Suspense> y no se
// pintaba hasta que cargaba el JavaScript.
export default async function LoginPage({ params, searchParams }: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const t = lang === 'en' ? enAuth : esAuth;

  // Vuelve al link que se abrió sin sesión (ver lib/safe-redirect).
  const next = safeNextPath(firstParam(sp.next), lang);
  const email = firstParam(sp.email);

  // Si viene de una invitación, el registro también tiene que ir a ella.
  const invitationPrefix = `/${lang}/${localizedSlug('invitacion', lang)}`;
  const forInvitation = !!next && (next === invitationPrefix || next.startsWith(`${invitationPrefix}?`));
  const invitationToken = forInvitation ? new URL(next!, 'http://kefy.invalid').searchParams.get('token') : null;

  const registerParams = new URLSearchParams();
  if (invitationToken) registerParams.set('invitation', invitationToken);
  else if (next) registerParams.set('next', next);
  if (email) registerParams.set('email', email);
  const registerHref = `/${lang}/register${registerParams.size ? `?${registerParams}` : ''}`;

  return (
    <AuthShell lang={lang} title={t.login.subtitle}>
      <LoginForm
        lang={lang}
        next={next}
        email={email}
        expired={!!firstParam(sp.expired)}
        resetDone={!!firstParam(sp.reset)}
        forInvitation={forInvitation}
        registerHref={registerHref}
      />
    </AuthShell>
  );
}
