// ─── Errores de los servicios ─────────────────────────────────────────────────
//
// Un servicio no devuelve Responses: lanza ServiceError con el código, el
// estado HTTP y —cuando viene de una guardia— el cuerpo exacto que la ruta
// devolvía antes. Así la UI sigue pudiendo distinguir subscriptionRequired,
// creditsExhausted o retryAfter venga el error de una ruta o de una
// herramienta del asistente.

import { NextResponse } from 'next/server';
import type { JWTPayload } from '@/types/auth';
import type { CreditOperation } from '@/lib/usage';
import type { RateLimitRule } from '@/lib/rate-limit';
import { checkAiSpend } from '@/lib/ai-guard';
import { reportError } from '@/lib/observability';
import type { ServiceContext } from '@/lib/services/context';

export type ServiceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'subscription_required'
  | 'credits_exhausted'
  | 'rate_limited'
  | 'unavailable'
  | 'provider_error'
  | 'brand_required'
  | 'scope_denied'
  | 'bound_key_org_write'
  | 'idempotency_mismatch'
  | 'idempotency_in_progress'
  | 'refusal'
  | 'step_limit';

export class ServiceError extends Error {
  /**
   * true → el servicio ya lo mandó a Sentry con su contexto (consulta, fase…).
   * serviceErrorResponse no lo vuelve a reportar.
   */
  public reported = false;

  constructor(
    public code: ServiceErrorCode,
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ServiceError';
  }

  /** Marca el error como ya reportado: `throw new ServiceError(...).markReported()`. */
  markReported(): this {
    this.reported = true;
    return this;
  }
}

/** Mensaje localizado: `msg(lang, 'Hola', 'Hello')`. */
export const msg = (lang: 'es' | 'en', es: string, en: string): string => (lang === 'en' ? en : es);

/**
 * Convierte un error lanzado por un servicio en la respuesta de la ruta.
 * Un ServiceError devuelve su cuerpo (o `{ error }`) con su estado —los 5xx se
 * reportan salvo que el servicio ya lo hiciera (markReported)—; cualquier otra
 * cosa es un fallo nuestro: se reporta y se responde 500 genérico.
 */
export function serviceErrorResponse(
  err: unknown,
  ctx?: { route: string; auth?: JWTPayload },
): NextResponse {
  if (err instanceof ServiceError) {
    if (err.status >= 500 && !err.reported) {
      reportError(err, { route: ctx?.route ?? 'lib/services', auth: ctx?.auth, extra: { code: err.code } });
    }
    return NextResponse.json(err.body ?? { error: err.message }, {
      status: err.status,
      headers: err.headers,
    });
  }

  reportError(err, { route: ctx?.route ?? 'lib/services', auth: ctx?.auth });
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

/**
 * Cobra una operación con IA desde un servicio. Pasa por la misma guardia que
 * las rutas (checkAiSpend: suscripción → rate limit → créditos) y, si bloquea,
 * lanza un ServiceError con el cuerpo y las cabeceras exactos de la guardia.
 *
 * Devuelve el refund: llamarlo si la generación falla después de cobrar.
 */
export async function chargeOrThrow(
  ctx: ServiceContext,
  operation: CreditOperation,
  route: string,
  rateRule?: RateLimitRule,
): Promise<() => Promise<void>> {
  const r = await checkAiSpend(ctx.auth, { operation, route, language: ctx.language, rateRule });
  if (r.ok) return r.refund;

  const code: ServiceErrorCode = r.body.subscriptionRequired
    ? 'subscription_required'
    : r.body.creditsExhausted
      ? 'credits_exhausted'
      : r.body.retryAfter !== undefined
        ? 'rate_limited'
        : 'unavailable';

  throw new ServiceError(code, r.status, String(r.body.error), r.body, r.headers);
}
