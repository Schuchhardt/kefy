'use client';

// Error boundary del dashboard. Está aparte del de `[lang]` para que un fallo
// dentro del dashboard conserve la barra lateral y el usuario pueda moverse a
// otra sección en lugar de quedarse en una pantalla vacía.

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import Button, { ButtonLink } from '@/components/ui/Button';
import Icon from '@/components/ui/icons';
import { toLocale } from '@/lib/i18n';
import esT from '@/locales/es/dashboard/error-boundary';
import enT from '@/locales/en/dashboard/error-boundary';

const T = { es: esT, en: enT } as const;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ lang: string }>();
  const lang = toLocale(params?.lang);
  const t = T[lang];

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="page" style={{ maxWidth: 560, marginInline: 'auto' }}>
      <div
        role="alert"
        style={{
          minHeight: 'calc(var(--dashboard-content-h) * 0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          textAlign: 'center',
          color: 'var(--text)',
        }}
      >
        <span style={{ color: 'var(--danger)', display: 'flex' }}>
          <Icon name="alert" size={32} />
        </span>
        <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif', fontSize: 20, fontWeight: 700, margin: 0 }}>
          {t.title}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 400 }}>{t.body}</p>

        {error.digest && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            <code style={{ fontFamily: 'var(--font-jetbrains), monospace', overflowWrap: 'anywhere' }}>
              {t.reference(error.digest)}
            </code>
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
          <Button variant="primary" onClick={reset} icon={<Icon name="refresh" size={16} />}>
            {t.retry}
          </Button>
          {/* Navegación completa, no del router: tras un fallo conviene
              recargar el estado del cliente. */}
          <ButtonLink href={`/${lang}/dashboard`} variant="ghost" external icon={<Icon name="home" size={16} />}>
            {t.home}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
