// ─── Guardia única para los endpoints que gastan dinero ──────────────────────
//
// Toda generación con IA pasa por tres frenos, y conviene que sea el mismo
// código en las nueve rutas que los necesitan:
//
//   1. Suscripción — ¿el mes gratis sigue vivo, o hay un plan pagado?
//      No se recupera hasta que se pague. Responde 402.
//   2. Rate limit por organización — corta ráfagas (un cliente en bucle, un
//      botón que se dispara varias veces). Se recupera solo en un minuto.
//   3. Créditos del mes — acota el gasto total. No se recupera hasta el mes
//      siguiente o hasta que se mejore el plan.
//
// El orden importa y es de más barato a más caro de deshacer: comprobar la
// suscripción es una lectura, y ni una ráfaga ni una cuenta impaga deben
// consumir créditos que el usuario sí pagó.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { JWTPayload } from '@/types/auth';
import { checkRateLimit, aiRule, rateLimitResponse } from '@/lib/rate-limit';
import {
  consumeCredits, refundCredits, creditsExhaustedResponse, type CreditOperation,
} from '@/lib/usage';
import { getEntitlement, blockMessage } from '@/lib/subscription';
import { reportError } from '@/lib/observability';

export interface AiGuardOptions {
  auth: JWTPayload;
  /** Qué se va a generar. Determina cuántos créditos cuesta. */
  operation: CreditOperation;
  route: string;
  language?: 'es' | 'en';
}

export interface AiGuardResult {
  /** `null` si el handler puede seguir; si no, la respuesta que debe devolver. */
  blocked: NextResponse | null;
  /**
   * Devuelve los créditos consumidos. Llamar si la generación falla después de
   * pasar la guardia — un fallo nuestro no se le cobra al usuario.
   */
  refund: () => Promise<void>;
}

export async function guardAiRequest(
  _req: NextRequest,
  { auth, operation, route, language = 'es' }: AiGuardOptions,
): Promise<AiGuardResult> {
  const noop = async () => {};

  // 1. Suscripción. 402 «Payment Required» y no 429: el usuario no ha excedido
  //    nada, le falta pagar, y la UI debe llevarlo a planes y no a reintentar.
  let entitlement;
  try {
    entitlement = await getEntitlement(auth.orgId);
  } catch (err) {
    reportError(err, { route, auth });
    const message = language === 'en'
      ? 'Could not verify your subscription. Try again in a moment.'
      : 'No pudimos verificar tu suscripción. Reintenta en un momento.';
    return { blocked: NextResponse.json({ error: message }, { status: 503 }), refund: noop };
  }

  if (!entitlement.canCreate) {
    const reason = entitlement.reason ?? 'canceled';
    return {
      blocked: NextResponse.json(
        {
          error: blockMessage(reason, language),
          subscriptionRequired: true,
          reason,
          status: entitlement.status,
        },
        { status: 402 },
      ),
      refund: noop,
    };
  }

  // 2. Rate limit.
  const limit = await checkRateLimit(aiRule(auth.orgId));
  if (!limit.allowed) {
    const message = language === 'en'
      ? 'Too many generations in a short time. Wait a moment and try again.'
      : 'Demasiadas generaciones en poco tiempo. Espera un momento y reintenta.';
    return { blocked: rateLimitResponse(limit, message), refund: noop };
  }

  // 3. Créditos.
  let credits;
  try {
    credits = await consumeCredits(auth.orgId, auth.plan, operation);
  } catch (err) {
    // consumeCredits falla cerrado a propósito: sin poder verificar el saldo no
    // se autoriza gasto. Ya reportó el error a Sentry por dentro.
    reportError(err, { route, auth, extra: { operation } });
    const message = language === 'en'
      ? 'Could not verify your AI credits. Try again in a moment.'
      : 'No pudimos verificar tus créditos de IA. Reintenta en un momento.';
    return { blocked: NextResponse.json({ error: message }, { status: 503 }), refund: noop };
  }

  if (!credits.allowed) {
    return { blocked: creditsExhaustedResponse(credits, language), refund: noop };
  }

  return {
    blocked: null,
    refund: () => refundCredits(auth.orgId, operation),
  };
}
