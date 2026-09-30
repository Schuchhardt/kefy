'use client';

// Formulario de login. Los textos salen de locales/*/auth.ts y los errores se
// traducen por `code` (lib/auth-errors.ts): antes la página estaba escrita en
// español dentro del componente y /en/login salía en español.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/auth/PasswordInput';
import Button from '@/components/ui/Button';
import { authErrorMessage } from '@/lib/auth-errors';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export interface LoginFormProps {
  lang: string;
  /** Destino ya validado con safeNextPath, o null. */
  next: string | null;
  email: string | null;
  expired: boolean;
  resetDone: boolean;
  /** Viene de una invitación: se explica por qué hay que entrar. */
  forInvitation: boolean;
  /** Enlace al registro que conserva el destino o la invitación. */
  registerHref: string;
}

export default function LoginForm({
  lang, next, email: initialEmail, expired, resetDone, forInvitation, registerHref,
}: LoginFormProps) {
  const t = lang === 'en' ? enAuth : esAuth;
  const router = useRouter();

  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status));
        setLoading(false);
        return;
      }
      // Se deja el botón cargando mientras navega: sin esto quedaba activo y
      // se podía volver a enviar.
      router.push(next ?? `/${lang}/dashboard`);
    } catch {
      setError(t.errors.network);
      setLoading(false);
    }
  }

  const forgotHref = `/${lang}/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  return (
    <>
      {resetDone && <p role="status" className="auth-banner">{t.login.resetDone}</p>}
      {expired && <p role="status" className="auth-banner auth-banner--warm">{t.login.expired}</p>}
      {forInvitation && <p className="auth-banner">{t.login.forInvitation}</p>}

      <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
        <div>
          <label htmlFor="login-email" className="auth-label">{t.fields.email}</label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!initialEmail}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.fields.emailPlaceholder}
            aria-invalid={error ? true : undefined}
          />
        </div>

        <div>
          <div className="auth-label-row">
            <label htmlFor="login-password" className="auth-label">{t.fields.password}</label>
            <Link href={forgotHref} className="auth-inline-link">{t.login.forgot}</Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            autoFocus={!!initialEmail}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.fields.passwordPlaceholder}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            aria-invalid={error ? true : undefined}
          />
        </div>

        {error && <p role="alert" className="auth-error">{error}</p>}

        <Button type="submit" variant="primary" size="lg" block loading={loading} className="auth-submit">
          {loading ? t.login.submitting : t.login.submit}
        </Button>
      </form>

      <p className="auth-alt">
        {t.login.noAccount}{' '}
        <Link href={registerHref}>{t.login.register}</Link>
      </p>
    </>
  );
}
