'use client';

// Pedir el enlace para crear una contraseña nueva. La respuesta del API es
// siempre la misma exista o no la cuenta (no revela qué emails están
// registrados), así que la confirmación lo dice con esas palabras.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { authErrorMessage } from '@/lib/auth-errors';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export default function ForgotPasswordForm({ lang, email: initialEmail }: { lang: string; email: string | null }) {
  const t = lang === 'en' ? enAuth : esAuth;
  const [email, setEmail] = useState(initialEmail ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(authErrorMessage(data, lang, res.status));
        return;
      }
      setSent(true);
    } catch {
      setError(t.errors.network);
    } finally {
      setLoading(false);
    }
  }

  const loginHref = `/${lang}/login${email ? `?email=${encodeURIComponent(email)}` : ''}`;

  if (sent) {
    return (
      <div className="auth-status" role="status">
        <p className="auth-status-title">{t.forgot.sentTitle}</p>
        <p>{t.forgot.sentBody}</p>
        <p className="auth-alt" style={{ marginTop: 0 }}>
          <Link href={loginHref}>{t.forgot.back}</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="auth-note">{t.forgot.intro}</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <label htmlFor="forgot-email" className="auth-label">{t.fields.email}</label>
          <input
            id="forgot-email"
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
          {loading ? t.forgot.submitting : t.forgot.submit}
        </Button>
      </form>
      <p className="auth-alt">
        <Link href={loginHref}>{t.forgot.back}</Link>
      </p>
    </>
  );
}
