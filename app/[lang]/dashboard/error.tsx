'use client';

// Error boundary del dashboard. Está aparte del de `[lang]` para que un fallo
// dentro del dashboard conserve la barra lateral y el usuario pueda moverse a
// otra sección en lugar de quedarse en una pantalla vacía.

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

const COPY = {
  es: {
    title: 'Esta sección falló',
    body: 'El error ya quedó registrado. Reintenta o ve a otra sección del dashboard.',
    retry: 'Reintentar',
    home: 'Ir al dashboard',
  },
  en: {
    title: 'This section failed',
    body: 'The error was logged. Retry or head to another dashboard section.',
    retry: 'Retry',
    home: 'Go to dashboard',
  },
} as const;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const lang = (params?.lang as string) === 'en' ? 'en' : 'es';
  const t = COPY[lang];

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
        textAlign: 'center',
        color: 'var(--text)',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 700, margin: 0 }}>
        {t.title}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 400 }}>{t.body}</p>

      {error.digest && (
        <code style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>ref: {error.digest}</code>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={reset}>
          {t.retry}
        </button>
        <a className="btn btn-ghost btn-sm" href={`/${lang}/dashboard`}>
          {t.home}
        </a>
      </div>
    </div>
  );
}
