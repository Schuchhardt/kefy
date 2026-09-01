// ─── Reporte de errores a Sentry desde el código de la app ───────────────────
//
// `instrumentation.ts` ya captura los errores que Next.js deja escapar de un
// route handler. Este módulo cubre el otro caso, mucho más común en Kefy: los
// `try/catch` que atrapan un fallo, devuelven un 4xx/5xx al usuario y hasta
// ahora solo dejaban rastro en un `console.error` que nadie lee en producción.
//
// El contexto (ruta, organización, usuario) es lo que convierte un error suelto
// en algo accionable: permite ver si un fallo afecta a una sola cuenta o a todas.

import * as Sentry from '@sentry/nextjs';
import type { JWTPayload } from '@/types/auth';

export interface ErrorContext {
  /** Identificador de la ruta o de la operación: 'POST /api/content/generate'. */
  route: string;
  /** Sesión, si el handler ya la resolvió. Solo se usan los ids, nunca el email. */
  auth?: Pick<JWTPayload, 'userId' | 'orgId' | 'plan'> | null;
  /** Datos extra del fallo. Se redactan las claves sensibles antes de enviarse. */
  extra?: Record<string, unknown>;
  /** Servicio externo implicado, si lo hay: 'anthropic', 'zernio', 'stripe'… */
  service?: string;
}

/**
 * Reporta un error a Sentry con contexto y lo deja también en los logs.
 *
 * Nunca lanza: un fallo del reporte no puede tumbar la request que lo originó.
 * Devuelve el id del evento de Sentry, o `null` si no se envió (sin DSN
 * configurado el SDK está inerte y esto es un no-op).
 */
export function reportError(error: unknown, context: ErrorContext): string | null {
  const message = error instanceof Error ? error.message : String(error);

  // El log local se mantiene: es lo que se ve en `vercel logs` y en desarrollo.
  console.error(`[${context.route}]`, message);

  try {
    return Sentry.captureException(error, (scope) => {
      scope.setTag('route', context.route);
      if (context.service) scope.setTag('service', context.service);

      if (context.auth) {
        scope.setTag('plan', context.auth.plan);
        scope.setTag('org_id', context.auth.orgId);
        // Solo el id: sin email, sin nombre, sin IP.
        scope.setUser({ id: context.auth.userId });
      }

      if (context.extra) scope.setContext('detalle', context.extra);

      return scope;
    });
  } catch {
    // Sentry mal configurado no debe romper el handler.
    return null;
  }
}

/**
 * Deja un rastro en el timeline del evento sin generar una alerta.
 * Útil para eventos que solo importan cuando después falla algo:
 * un reintento, una cuota agotada, una respuesta rara de un tercero.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({ message, data, level: 'info' });
  } catch {
    /* no-op */
  }
}

/**
 * Reporta una condición anómala que no llegó a lanzar una excepción:
 * un tercero que responde 200 con un cuerpo inválido, una reconciliación que
 * no encuentra su destino, un webhook con firma correcta y evento desconocido.
 */
export function reportWarning(message: string, context: ErrorContext): string | null {
  console.warn(`[${context.route}]`, message);

  try {
    return Sentry.captureMessage(message, (scope) => {
      scope.setLevel('warning');
      scope.setTag('route', context.route);
      if (context.service) scope.setTag('service', context.service);
      if (context.auth) {
        scope.setTag('plan', context.auth.plan);
        scope.setTag('org_id', context.auth.orgId);
        scope.setUser({ id: context.auth.userId });
      }
      if (context.extra) scope.setContext('detalle', context.extra);
      return scope;
    });
  } catch {
    return null;
  }
}
