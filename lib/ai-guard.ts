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
//      siguiente o hasta que se mejore el plan. Para los mensajes al asistente
//      (`assistant_message`) este paso descuenta de su cuota mensual de
//      mensajes en vez de los créditos.
//
// El orden importa y es de más barato a más caro de deshacer: comprobar la
// suscripción es una lectura, y ni una ráfaga ni una cuenta impaga deben
// consumir créditos que el usuario sí pagó.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { JWTPayload } from '@/types/auth';
import {
  checkRateLimit, aiRule, rateLimitBody, rateLimitHeaders, type RateLimitRule,
} from '@/lib/rate-limit';
import {
  consumeCredits, refundCredits, creditsExhaustedBody, type CreditOperation,
  consumeAssistantMessage, refundAssistantMessage, assistantQuotaExhaustedBody,
} from '@/lib/usage';
import { getEntitlement, blockMessage } from '@/lib/subscription';
import { reportError } from '@/lib/observability';

/**
 * Lo que puede gastar una petición. Las operaciones de créditos descuentan del
 * pool mensual de créditos de IA; `assistant_message` descuenta de la cuota
 * mensual de mensajes del asistente (chatear no gasta créditos).
 */
export type SpendOperation = CreditOperation | 'assistant_message';

export interface AiGuardOptions {
  auth: JWTPayload;
  /** Qué se va a generar. Determina cuántos créditos cuesta. */
  operation: SpendOperation;
  route: string;
  language?: 'es' | 'en';
  /** Regla de rate limit a aplicar. Por defecto, la de generación con IA. */
  rateRule?: RateLimitRule;
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

/**
 * Resultado de la guardia sin HTTP: o se puede gastar (con su refund), o el
 * estado, el cuerpo y las cabeceras a devolver. Lo usan tanto `guardAiRequest`
 * como los servicios que llama el asistente, que no siempre responden con un
 * Response (MCP, herramientas del chat).
 */
export type SpendCheck =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; status: number; body: Record<string, unknown>; headers?: Record<string, string> };

export async function checkAiSpend(
  auth: JWTPayload,
  { operation, route, language = 'es', rateRule }: Omit<AiGuardOptions, 'auth'>,
): Promise<SpendCheck> {
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
    return { ok: false, status: 503, body: { error: message } };
  }

  if (!entitlement.canCreate) {
    const reason = entitlement.reason ?? 'canceled';
    return {
      ok: false,
      status: 402,
      body: {
        error: blockMessage(reason, language),
        subscriptionRequired: true,
        reason,
        status: entitlement.status,
      },
    };
  }

  // 2. Rate limit.
  const limit = await checkRateLimit(rateRule ?? aiRule(auth.orgId));
  if (!limit.allowed) {
    const message = operation === 'assistant_message'
      ? (language === 'en'
        ? 'Too many messages in a short time. Wait a moment and try again.'
        : 'Demasiados mensajes en poco tiempo. Espera un momento y reintenta.')
      : (language === 'en'
        ? 'Too many generations in a short time. Wait a moment and try again.'
        : 'Demasiadas generaciones en poco tiempo. Espera un momento y reintenta.');
    return {
      ok: false,
      status: 429,
      body: rateLimitBody(limit, message),
      headers: rateLimitHeaders(limit),
    };
  }

  // 3a. Cuota de mensajes del asistente: no toca los créditos de IA.
  if (operation === 'assistant_message') {
    let quota;
    try {
      quota = await consumeAssistantMessage(auth.orgId, auth.plan);
    } catch (err) {
      // Falla cerrado, igual que los créditos.
      reportError(err, { route, auth, extra: { operation } });
      const message = language === 'en'
        ? 'Could not verify your assistant message quota. Try again in a moment.'
        : 'No pudimos verificar tu cuota de mensajes del asistente. Reintenta en un momento.';
      return { ok: false, status: 503, body: { error: message } };
    }

    if (!quota.allowed) {
      return { ok: false, status: 429, body: assistantQuotaExhaustedBody(quota, language) };
    }

    return { ok: true, refund: () => refundAssistantMessage(auth.orgId) };
  }

  // 3b. Créditos.
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
    return { ok: false, status: 503, body: { error: message } };
  }

  if (!credits.allowed) {
    return { ok: false, status: 429, body: creditsExhaustedBody(credits, language) };
  }

  return { ok: true, refund: () => refundCredits(auth.orgId, operation) };
}

export async function guardAiRequest(
  _req: NextRequest,
  opts: AiGuardOptions,
): Promise<AiGuardResult> {
  const r = await checkAiSpend(opts.auth, opts);
  if (r.ok) return { blocked: null, refund: r.refund };
  return {
    blocked: NextResponse.json(r.body, { status: r.status, headers: r.headers }),
    refund: async () => {},
  };
}
