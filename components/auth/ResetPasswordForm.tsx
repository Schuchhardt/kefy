'use client';

// Crear una contraseña nueva desde el enlace del correo.
//
// Antes la página dejaba escribir la contraseña dos veces y solo al enviar
// decía que el enlace había caducado. Ahora lo comprueba al abrirse
// (GET /api/auth/reset-password) y, si no sirve, ofrece pedir otro.

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/auth/PasswordInput';
import PasswordRules from '@/components/auth/PasswordRules';
import Button, { ButtonLink, Spinner } from '@/components/ui/Button';
import { authErrorMessage } from '@/lib/auth-errors';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

type LinkState = 'checking' | 'ready' | 'invalid';

export default function ResetPasswordForm({ lang, token }: { lang: string; token: string | null }) {
  const t = lang === 'en' ? enAuth : esAuth;
  const router = useRouter();

  const [linkState, setLinkState] = useState<LinkState>(token ? 'checking' : 'invalid');
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) {
          setLinkState('ready');
        } else if (res.status === 429) {
          // El enlace puede ser bueno: se deja intentar y el POST dirá.
          setLinkState('ready');
        } else {
          setLinkError(authErrorMessage(data, lang, res.status));
          setLinkState('invalid');
        }
      } catch {
        // Sin red no se puede comprobar: se deja el formulario y el envío avisará.
        if (!cancelled) setLinkState('ready');
      }
    })();
    return () => { cancelled = true; };
  }, [token, lang]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t.errors.password_too_short); return; }
    if (password !== confirm) { setError(t.errors.passwords_mismatch); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.code;
        if (code === 'reset_invalid' || code === 'reset_expired') {
          setLinkError(authErrorMessage(data, lang, res.status));
          setLinkState('invalid');
        } else {
          setError(authErrorMessage(data, lang, res.status));
        }
        setLoading(false);
        return;
      }
      router.push(`/${lang}/login?reset=1`);
    } catch {
      setError(t.errors.network);
      setLoading(false);
    }
  }

  if (linkState === 'checking') {
    return (
      <div className="auth-status" role="status">
        <Spinner size={20} />
        <p>{t.reset.checking}</p>
      </div>
    );
  }

  if (linkState === 'invalid') {
    return (
      <div className="auth-status">
        <p className="auth-status-title">{t.reset.invalidTitle}</p>
        <p>{linkError || t.reset.invalidBody}</p>
        <div className="auth-actions">
          <ButtonLink href={`/${lang}/forgot-password`} variant="primary" size="lg" block>
            {t.reset.requestNew}
          </ButtonLink>
          <ButtonLink href={`/${lang}/login`} variant="ghost" size="lg" block>
            {t.reset.back}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <label htmlFor="reset-password" className="auth-label">{t.fields.newPassword}</label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.fields.newPasswordPlaceholder}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            aria-describedby="reset-password-rules"
          />
        </div>
        <div>
          <label htmlFor="reset-confirm" className="auth-label">{t.fields.confirmPassword}</label>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
            aria-describedby="reset-password-rules"
          />
          <PasswordRules id="reset-password-rules" lang={lang} password={password} confirm={confirm} />
        </div>

        {error && <p role="alert" className="auth-error">{error}</p>}

        <Button type="submit" variant="primary" size="lg" block loading={loading} className="auth-submit">
          {loading ? t.reset.submitting : t.reset.submit}
        </Button>
      </form>
      <p className="auth-alt">
        <Link href={`/${lang}/login`}>{t.reset.back}</Link>
      </p>
    </>
  );
}
