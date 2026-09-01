'use client';

// Error boundary de las rutas con idioma. A diferencia de `app/global-error`,
// este conserva el layout —y con él la navegación—, así que el usuario puede
// seguir usando el resto de la app.

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

const COPY = {
  es: {
    title: 'Algo se rompió',
    body: 'Ya recibimos el reporte y lo estamos revisando. Puedes reintentar o volver al inicio.',
    retry: 'Reintentar',
    home: 'Ir al inicio',
  },
  en: {
    title: 'Something broke',
    body: 'We already got the report and are looking into it. You can retry or go back home.',
    retry: 'Retry',
    home: 'Go home',
  },
} as const;

export default function LangError({
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
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        color: 'var(--text)',
      }}
    >
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 24, fontWeight: 700, margin: 0 }}>
        {t.title}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0, maxWidth: 420 }}>{t.body}</p>

      {error.digest && (
        <code style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>ref: {error.digest}</code>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={reset}>
          {t.retry}
        </button>
        <a className="btn btn-ghost btn-sm" href={`/${lang}`}>
          {t.home}
        </a>
      </div>
    </div>
  );
}
