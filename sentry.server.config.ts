// Configuración de Sentry para el runtime Node.js (route handlers, server
// components, crons). La carga `instrumentation.ts`.
//
// Sin SENTRY_DSN el SDK queda inerte: no inicializa transporte ni envía nada,
// así que en desarrollo y en tests no hay ruido ni llamadas de red.

import * as Sentry from '@sentry/nextjs';
import { scrubEvent, isIgnoredError } from '@/lib/sentry-scrub';
import { APP_VERSION } from '@/lib/app-version';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: APP_VERSION,

  // Muestreo de trazas: 10 % en producción es suficiente para ver latencias sin
  // inflar la cuota. En preview se traza todo para depurar despliegues.
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,

  // Kefy ya redacta a mano lo que importa; esto evita que el SDK adjunte
  // cabeceras y cuerpos por su cuenta.
  sendDefaultPii: false,

  beforeSend(event, hint) {
    const message = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (isIgnoredError(message)) return null;
    return scrubEvent(event, hint);
  },
});
