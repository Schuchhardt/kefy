'use client';

// ─── Último recurso ante un error de render ──────────────────────────────────
//
// `global-error` reemplaza al layout raíz entero, así que tiene que traer su
// propio <html> y <body> y no puede apoyarse en nada del layout ni en las
// variables CSS de globals.css (puede que no lleguen a cargarse). Los estilos
// van en línea a propósito.
//
// Solo se monta cuando falla el propio layout raíz; los errores de las páginas
// los recoge el `error.tsx` de cada segmento, que sí conserva la navegación.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Un fallo del layout raíz deja la app inservible: siempre se reporta.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          background: '#08080A',
          color: '#F2F2F2',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Algo se rompió
        </h1>
        <p style={{ color: 'rgba(242,242,242,0.6)', fontSize: 14, margin: 0, maxWidth: 420 }}>
          Ya recibimos el reporte y lo estamos revisando. Puedes reintentar o volver al inicio.
        </p>

        {/* El digest es el identificador que aparece también en los logs del
            servidor: pedirlo por soporte permite encontrar el error exacto. */}
        {error.digest && (
          <code style={{ fontSize: 11, color: 'rgba(242,242,242,0.35)' }}>
            ref: {error.digest}
          </code>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#C6FF4B',
              color: '#08080A',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          {/* Navegación dura a propósito: `global-error` sustituye al layout raíz,
              así que el router del App Router puede no estar operativo. Un
              <Link> dependería de él; recargar la página siempre funciona. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid rgba(242,242,242,0.15)',
              color: '#F2F2F2',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Ir al inicio
          </a>
        </div>
      </body>
    </html>
  );
}
