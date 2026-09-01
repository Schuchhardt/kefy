// Configuración de Sentry para el runtime Edge (proxy.ts / middleware).
// El runtime Edge no comparte proceso con Node, así que necesita su propio init.

import * as Sentry from '@sentry/nextjs';
import { scrubEvent, isIgnoredError } from '@/lib/sentry-scrub';
import { APP_VERSION } from '@/lib/app-version';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: APP_VERSION,
  tracesSampleRate: process.env.VERCEL_ENV === 'production' ? 0.1 : 1.0,
  sendDefaultPii: false,

  beforeSend(event, hint) {
    const message = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (isIgnoredError(message)) return null;
    return scrubEvent(event, hint);
  },
});
