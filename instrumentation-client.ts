// Configuración de Sentry en el navegador. Next.js carga este archivo
// automáticamente en el bundle del cliente.
//
// El DSN del cliente va en NEXT_PUBLIC_SENTRY_DSN porque tiene que viajar al
// navegador. Un DSN es público por diseño: solo permite escribir eventos.

import * as Sentry from '@sentry/nextjs';
import { scrubEvent, isIgnoredError } from '@/lib/sentry-scrub';
import { APP_VERSION } from '@/lib/app-version';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: APP_VERSION,

  tracesSampleRate: 0.1,
  sendDefaultPii: false,

  // Session Replay: graba la sesión solo cuando hay error, con todo el texto y
  // los medios enmascarados. Sirve para ver qué hizo el usuario antes del fallo
  // sin exponer el contenido de sus marcas ni sus credenciales.
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event, hint) {
    const message = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (isIgnoredError(message)) return null;
    return scrubEvent(event, hint);
  },
});

// Instrumenta las transiciones de ruta del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
