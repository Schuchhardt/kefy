'use client';

// Pantalla de acceso: una sola entrada para iniciar sesión o registrarse.
//
// 1. Se pide solo el email y se pregunta a POST /api/auth/check-email.
// 2. Si tiene cuenta, se pide la contraseña (POST /api/auth/login).
// 3. Si no, nombre y contraseña (POST /api/auth/register). El registro exige
//    nombre del negocio; aquí se usa el nombre de la persona y la marca se
//    completa después en el onboarding.
//
// /login y /register siguen existiendo para invitaciones, sesión expirada y
// enlaces antiguos.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordRules from '@/components/auth/PasswordRules';
import Button from '@/components/ui/Button';
import { authErrorMessage } from '@/lib/auth-errors';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type Step = 'email' | 'login' | 'register';

export interface AccessFormProps {
  lang: string;
  /** Destino ya validado con safeNextPath, o null. */
  next: string | null;
  email: string | null;
}

export default function AccessForm({ lang, next, email: initialEmail }: AccessFormProps) {
  const t = lang === 'en' ? enAuth : esAuth;
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => null) };
  }

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/check-email', { email });
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status));
        return;
      }
      setPassword('');
      setStep(data?.exists ? 'login' : 'register');
    } catch {
      setError(t.errors.network);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/login', { email, password });
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status));
        setLoading(false);
        return;
      }
      // El botón sigue cargando mientras navega para que no se reenvíe.
      router.push(next ?? `/${lang}/dashboard`);
    } catch {
      setError(t.errors.network);
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t.errors.password_too_short);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/register', { name, email, password, orgName: name });
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status, { rateLimitCode: 'rate_limited_register' }));
        setLoading(false);
        return;
      }
      router.push(next ?? `/${lang}/onboarding`);
    } catch {
      setError(t.errors.network);
      setLoading(false);
    }
  }

  function changeEmail() {
    setStep('email');
    setError('');
    setPassword('');
  }

  const emailSummary = (
    <div className="auth-label-row">
      <span className="auth-label">{email}</span>
      <button type="button" className="auth-inline-link" onClick={changeEmail}>
        {t.access.changeEmail}
      </button>
    </div>
  );

  if (step === 'email') {
    return (
      <>
        <p className="auth-note">{t.access.intro}</p>
        <form onSubmit={handleEmail} className="auth-form">
          <div>
            <label htmlFor="access-email" className="auth-label">{t.fields.email}</label>
            <input
              id="access-email"
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.fields.emailPlaceholder}
              aria-invalid={error ? true : undefined}
            />
          </div>

          {error && <p role="alert" className="auth-error">{error}</p>}

          <Button type="submit" variant="primary" size="lg" block loading={loading} className="auth-submit">
            {loading ? t.access.checking : t.access.continue}
          </Button>
        </form>
      </>
    );
  }

  if (step === 'login') {
    const forgotHref = `/${lang}/forgot-password?email=${encodeURIComponent(email)}`;
    return (
      <>
        <p role="status" className="auth-banner">{t.access.welcomeBack}</p>
        <form onSubmit={handleLogin} className="auth-form">
          {emailSummary}
          {/* Para que el gestor de contraseñas asocie la clave al email. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

          <div>
            <div className="auth-label-row">
              <label htmlFor="access-password" className="auth-label">{t.fields.password}</label>
              <Link href={forgotHref} className="auth-inline-link">{t.login.forgot}</Link>
            </div>
            <PasswordInput
              id="access-password"
              autoComplete="current-password"
              autoFocus
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
      </>
    );
  }

  return (
    <>
      <p role="status" className="auth-banner">{t.access.newAccount}</p>
      <form onSubmit={handleRegister} className="auth-form">
        {emailSummary}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

        <div>
          <label htmlFor="access-name" className="auth-label">{t.fields.name}</label>
          <input
            id="access-name"
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

        <div>
          <label htmlFor="access-new-password" className="auth-label">{t.fields.password}</label>
          <PasswordInput
            id="access-new-password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.fields.newPasswordPlaceholder}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            aria-describedby="access-password-rules"
          />
          <PasswordRules id="access-password-rules" lang={lang} password={password} />
        </div>

        {error && <p role="alert" className="auth-error">{error}</p>}

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
    </>
  );
}
