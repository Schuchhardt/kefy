'use client';

// Formulario de registro.
//
// - Textos en el idioma de la ruta y errores traducidos por `code`.
// - Las reglas de la contraseña se ven mientras se escribe.
// - Si el email ya existe, ofrece iniciar sesión o recuperar la contraseña con
//   el email ya puesto, en vez de un «Email already registered» sin salida.
// - Con `?invitation=<token>` no pide negocio: la cuenta entra en la
//   organización que invitó (POST /api/auth/register con `invitationToken`).

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordRules from '@/components/auth/PasswordRules';
import Button from '@/components/ui/Button';
import { authErrorCode, authErrorMessage } from '@/lib/auth-errors';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

interface InvitationInfo {
  email: string;
  orgName: string | null;
}

export interface RegisterFormProps {
  lang: string;
  next: string | null;
  email: string | null;
  invitationToken: string | null;
}

export default function RegisterForm({ lang, next, email: initialEmail, invitationToken }: RegisterFormProps) {
  const t = lang === 'en' ? enAuth : esAuth;
  const router = useRouter();

  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);

  // Con invitación se muestra a qué equipo se entra y se fija su email.
  useEffect(() => {
    if (!invitationToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/team/invitations/accept?token=${encodeURIComponent(invitationToken)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(authErrorMessage(data, lang, res.status));
          return;
        }
        setInvitation({ email: data.email, orgName: data.orgName ?? null });
        setEmail(data.email);
      } catch {
        if (!cancelled) setError(t.errors.network);
      }
    })();
    return () => { cancelled = true; };
  }, [invitationToken, lang, t]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEmailTaken(false);

    if (password.length < 8) {
      setError(t.errors.password_too_short);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          invitationToken
            ? { name, email, password, invitationToken }
            : { name, email, password, orgName },
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEmailTaken(authErrorCode(data) === 'email_taken');
        setError(authErrorMessage(data, lang, res.status, { rateLimitCode: 'rate_limited_register' }));
        setLoading(false);
        return;
      }
      // Quien entra por invitación ya tiene la marca del equipo: va directo al
      // dashboard. Una cuenta nueva empieza por el onboarding.
      if (data?.joinedByInvitation) router.push(next ?? `/${lang}/dashboard`);
      else router.push(next ?? `/${lang}/onboarding`);
    } catch {
      setError(t.errors.network);
      setLoading(false);
    }
  }

  const loginParams = new URLSearchParams();
  if (email) loginParams.set('email', email);
  if (next) loginParams.set('next', next);
  const loginHref = `/${lang}/login${loginParams.size ? `?${loginParams}` : ''}`;
  const resetHref = `/${lang}/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  return (
    <>
      {invitationToken ? (
        <p className="auth-banner">
          {invitation?.orgName
            ? t.register.forInvitation(invitation.orgName)
            : t.register.forInvitationGeneric}
        </p>
      ) : (
        <p className="auth-note">{t.register.trial}</p>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className={invitationToken ? undefined : 'auth-row'}>
          <div>
            <label htmlFor="register-name" className="auth-label">{t.fields.name}</label>
            <input
              id="register-name"
              className="auth-input"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.fields.namePlaceholder}
            />
          </div>
          {!invitationToken && (
            <div>
              <label htmlFor="register-org" className="auth-label">{t.fields.org}</label>
              <input
                id="register-org"
                className="auth-input"
                type="text"
                autoComplete="organization"
                autoCapitalize="words"
                required
                maxLength={100}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t.fields.orgPlaceholder}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="register-email" className="auth-label">{t.fields.email}</label>
          <input
            id="register-email"
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            readOnly={!!invitation}
            aria-describedby={invitation ? 'register-email-hint' : undefined}
            aria-invalid={emailTaken ? true : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.fields.emailPlaceholder}
          />
          {invitation && (
            <p id="register-email-hint" className="auth-legal" style={{ textAlign: 'left', marginTop: 6 }}>
              {t.register.emailFromInvitation}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="register-password" className="auth-label">{t.fields.password}</label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.fields.newPasswordPlaceholder}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            aria-describedby="register-password-rules"
          />
          <PasswordRules id="register-password-rules" lang={lang} password={password} />
        </div>

        {error && (
          <p role="alert" className="auth-error">
            {error}
            {emailTaken && (
              <>
                {' '}{t.register.emailTakenActions}{' '}
                <Link href={loginHref}>{t.register.goLogin}</Link>
                {' '}{t.register.or}{' '}
                <Link href={resetHref}>{t.register.goReset}</Link>.
              </>
            )}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={loading} className="auth-submit">
          {loading ? t.register.submitting : t.register.submit}
        </Button>

        <p className="auth-legal">
          {t.register.termsPrefix}{' '}
          <Link href={`/${lang}/terminos`}>{t.register.terms}</Link>{' '}
          {t.register.and}{' '}
          <Link href={`/${lang}/privacidad`}>{t.register.privacy}</Link>.
        </p>
      </form>

      <p className="auth-alt">
        {t.register.haveAccount}{' '}
        <Link href={loginHref}>{t.register.login}</Link>
      </p>
    </>
  );
}
