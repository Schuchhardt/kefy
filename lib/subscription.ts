// ─── Estado de la suscripción ────────────────────────────────────────────────
//
// Kefy no tiene plan gratuito: toda cuenta nueva entra en Starter con el primer
// mes gratis. Por eso hay dos preguntas distintas que no hay que confundir:
//
//   ¿Qué plan tiene?     → cuántos créditos y cuántas marcas le tocan.
//   ¿Puede crear?        → si el trial sigue vivo o si hay una suscripción paga.
//
// Al terminar el mes gratis sin pagar, la cuenta **no se bloquea entera**:
// deja de poder generar y publicar, pero entra al dashboard y conserva todo lo
// que creó. Perder el acceso a su propio contenido es la forma más rápida de
// que alguien que dudaba no vuelva nunca.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { NextResponse } from 'next/server';

/** Duración del mes gratis que recibe toda cuenta nueva. */
export const TRIAL_DAYS = 30;

export type SubscriptionStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface Entitlement {
  /** Puede generar contenido nuevo y publicar. */
  canCreate: boolean;
  status: SubscriptionStatus;
  /** true mientras corre el mes gratis. */
  isTrialing: boolean;
  /** Fin del trial o del período pagado. */
  periodEnd: Date | null;
  /** Días que quedan de trial. `null` si no está en trial. */
  trialDaysLeft: number | null;
  /** Por qué se bloqueó, para poder dar un mensaje concreto. */
  reason: 'trial_expired' | 'payment_failed' | 'canceled' | 'no_subscription' | null;
}

/** Fecha de fin del mes gratis para una cuenta creada ahora. */
export function trialEndsAt(now = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Traduce una fila de `kefy_subscriptions` a lo que la cuenta puede hacer.
 * Función pura: toda la lógica de decisión está aquí y se puede testear sin
 * base de datos.
 */
export function resolveEntitlement(
  sub: { status?: string | null; current_period_end?: string | null } | null,
  now = new Date(),
): Entitlement {
  // Sin fila de suscripción no hay nada que autorice a gastar. Pasa si el alta
  // quedó a medias; se reporta desde getEntitlement.
  if (!sub?.status) {
    return {
      canCreate: false, status: 'canceled', isTrialing: false,
      periodEnd: null, trialDaysLeft: null, reason: 'no_subscription',
    };
  }

  const status = sub.status as SubscriptionStatus;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const expired = periodEnd !== null && periodEnd.getTime() <= now.getTime();

  if (status === 'trialing') {
    const msLeft = periodEnd ? periodEnd.getTime() - now.getTime() : 0;
    const trialDaysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

    return {
      canCreate: !expired,
      status,
      isTrialing: true,
      periodEnd,
      trialDaysLeft,
      reason: expired ? 'trial_expired' : null,
    };
  }

  if (status === 'active') {
    // Stripe renueva `current_period_end` en cada cobro. Que esté vencido
    // significa que el webhook de renovación no llegó, no que el usuario deba
    // dinero: se le deja seguir y se prefiere el error a favor de quien paga.
    return {
      canCreate: true, status, isTrialing: false,
      periodEnd, trialDaysLeft: null, reason: null,
    };
  }

  // past_due: el cobro falló pero Stripe sigue reintentando. Se corta la
  // creación —que es lo que cuesta dinero— sin tocar el resto de la cuenta.
  if (status === 'past_due') {
    return {
      canCreate: false, status, isTrialing: false,
      periodEnd, trialDaysLeft: null, reason: 'payment_failed',
    };
  }

  return {
    canCreate: false, status, isTrialing: false,
    periodEnd, trialDaysLeft: null,
    reason: status === 'unpaid' ? 'payment_failed' : 'canceled',
  };
}

/** Lee la suscripción de la organización y resuelve qué puede hacer. */
export async function getEntitlement(orgId: string, now = new Date()): Promise<Entitlement> {
  const db = createSupabaseServer();

  const { data, error } = await db
    .from('kefy_subscriptions')
    .select('status, current_period_end')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/subscription', service: 'supabase', extra: { orgId },
    });
    // Falla cerrado, igual que los créditos: sin poder verificar la suscripción
    // no se autoriza gasto.
    throw new Error('No se pudo verificar el estado de la suscripción');
  }

  if (!data) {
    reportError(new Error(`Organización sin fila en kefy_subscriptions`), {
      route: 'lib/subscription', extra: { orgId },
    });
  }

  return resolveEntitlement(data, now);
}

const BLOCK_MESSAGES: Record<
  NonNullable<Entitlement['reason']>,
  { es: string; en: string }
> = {
  trial_expired: {
    es: 'Tu mes gratis terminó. Elige un plan para seguir creando contenido — todo lo que ya creaste sigue disponible.',
    en: 'Your free month has ended. Pick a plan to keep creating — everything you already made is still there.',
  },
  payment_failed: {
    es: 'No pudimos procesar tu pago. Actualiza tu método de pago para seguir creando contenido.',
    en: "We couldn't process your payment. Update your payment method to keep creating.",
  },
  canceled: {
    es: 'Tu suscripción está cancelada. Reactívala para seguir creando contenido.',
    en: 'Your subscription is canceled. Reactivate it to keep creating.',
  },
  no_subscription: {
    es: 'No encontramos una suscripción activa para tu cuenta. Escríbenos y lo resolvemos.',
    en: "We couldn't find an active subscription for your account. Contact us and we'll sort it out.",
  },
};

export function blockMessage(
  reason: NonNullable<Entitlement['reason']>,
  language: 'es' | 'en' = 'es',
): string {
  return BLOCK_MESSAGES[reason][language];
}

/**
 * Guardia de suscripción para las rutas que no gastan créditos pero sí son
 * «crear»: publicar y programar. Devuelve la respuesta a retornar, o `null` si
 * la cuenta puede seguir.
 *
 * Las rutas de generación no usan esto: pasan por `guardAiRequest`, que ya
 * incluye este chequeo además del rate limit y los créditos.
 */
export async function requireActiveSubscription(
  orgId: string,
  language: 'es' | 'en' = 'es',
  now = new Date(),
): Promise<NextResponse | null> {
  let entitlement: Entitlement;
  try {
    entitlement = await getEntitlement(orgId, now);
  } catch {
    // getEntitlement ya reportó a Sentry. Falla cerrado, como los créditos.
    const message = language === 'en'
      ? 'Could not verify your subscription. Try again in a moment.'
      : 'No pudimos verificar tu suscripción. Reintenta en un momento.';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  if (entitlement.canCreate) return null;

  const reason = entitlement.reason ?? 'canceled';
  return NextResponse.json(
    {
      error: blockMessage(reason, language),
      subscriptionRequired: true,
      reason,
      status: entitlement.status,
    },
    { status: 402 },
  );
}
