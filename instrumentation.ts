// Punto de entrada de instrumentación de Next.js.
// Carga la configuración de Sentry que corresponda al runtime activo.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captura los errores que Next.js lanza al renderizar en el servidor
// (server components, route handlers y generación de páginas).
export const onRequestError = Sentry.captureRequestError;
