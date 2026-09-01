// ─── Créditos de IA ───────────────────────────────────────────────────────────
//
// La página de precios vende un único pool mensual de «créditos IA» por plan.
// Esto lo implementa tal cual: un contador por organización y mes, no varios
// contadores por tipo de contenido.
//
// Cada operación descuenta según lo que cuesta de verdad. Sin ponderar, los 150
// créditos de Starter podrían gastarse en 150 renders de video, que cuestan
// órdenes de magnitud más que 150 captions.
//
// El consumo es atómico en Postgres (`kefy_credits_consume`): el chequeo y el
// incremento ocurren en la misma sentencia, así dos peticiones simultáneas al
// borde del tope no pueden pasar ambas.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { NextResponse } from 'next/server';
import type { BillingPlan } from '@/types/billing';

/** Operaciones que gastan créditos. */
export type CreditOperation = 'text' | 'image' | 'video';

/**
 * Coste en créditos de cada operación, proporcional a lo que cuesta ejecutarla.
 *
 * Vive aquí y no en la base de datos para poder recalibrarlo sin migrar: si
 * cambia el precio de un proveedor, se ajusta el peso y ya.
 */
export const CREDIT_COSTS: Record<CreditOperation, number> = {
  text:   1,   // una llamada a Claude/GPT
  image:  3,   // generación de imagen + procesado + subida
  video: 10,   // render en Remotion Lambda + alojamiento
};

/**
 * Créditos mensuales por plan. Son exactamente los que anuncia la página de
 * precios: si estos números cambian, hay que cambiar la página también.
 */
export const PLAN_CREDITS: Record<BillingPlan, number> = {
  starter:   150,
  pro:       500,
  business: 2000,
};

/** Período de facturación del uso: mes calendario en UTC ('2026-09'). */
export function usagePeriod(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function creditsFor(plan: string): number {
  // Ante un plan desconocido se aplica el tramo más bajo: no se regala gasto.
  return PLAN_CREDITS[plan as BillingPlan] ?? PLAN_CREDITS.starter;
}

export function costOf(operation: CreditOperation): number {
  return CREDIT_COSTS[operation];
}

export interface CreditsResult {
  allowed: boolean;
  /** Créditos consumidos en el período tras esta operación. */
  used: number;
  limit: number;
  remaining: number;
  /** Lo que costó (o habría costado) esta operación. */
  cost: number;
  operation: CreditOperation;
}

/**
 * Descuenta los créditos de una operación. Devuelve `allowed: false` si no
 * caben en lo que queda del mes, sin descontar nada.
 *
 * **Falla cerrado**: si no se puede verificar el saldo, no se autoriza la
 * generación. Al revés que el rate limiter — un limitador caído deja el
 * servicio sin freno un rato, un contador caído deja la factura de IA abierta.
 */
export async function consumeCredits(
  orgId: string,
  plan: string,
  operation: CreditOperation,
  now = new Date(),
): Promise<CreditsResult> {
  const limit = creditsFor(plan);
  const cost = costOf(operation);
  const period = usagePeriod(now);

  const db = createSupabaseServer();
  const { data, error } = await db.rpc('kefy_credits_consume', {
    p_org_id: orgId,
    p_period: period,
    p_amount: cost,
    p_limit: limit,
  });

  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/usage', service: 'supabase',
      extra: { orgId, plan, operation, period },
    });
    throw new Error('No se pudo verificar tus créditos');
  }

  const used = typeof data === 'number' ? data : Number(data);

  // -1 es la señal de la función SQL: no cabía en el tope.
  if (used === -1) {
    return { allowed: false, used: limit, limit, remaining: 0, cost, operation };
  }

  return {
    allowed: true,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    cost,
    operation,
  };
}

/**
 * Devuelve créditos al pool. Se llama cuando la generación falla después de
 * haberlos descontado: al usuario no se le cobra un fallo nuestro.
 *
 * No lanza — es una corrección best-effort dentro de un camino que ya está
 * gestionando otro error.
 */
export async function refundCredits(
  orgId: string,
  operation: CreditOperation,
  now = new Date(),
): Promise<void> {
  try {
    const db = createSupabaseServer();
    const { error } = await db.rpc('kefy_credits_refund', {
      p_org_id: orgId,
      p_period: usagePeriod(now),
      p_amount: costOf(operation),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    reportError(err, {
      route: 'lib/usage', service: 'supabase',
      extra: { orgId, operation, operacion: 'refund' },
    });
  }
}

export interface UsageSummary {
  used: number;
  limit: number;
  remaining: number;
  period: string;
}

/** Saldo de créditos de una organización en el mes en curso. */
export async function getUsage(
  orgId: string,
  plan: string,
  now = new Date(),
): Promise<UsageSummary> {
  const period = usagePeriod(now);
  const limit = creditsFor(plan);
  const db = createSupabaseServer();

  const { data } = await db
    .from('kefy_usage_counters')
    .select('credits')
    .eq('org_id', orgId)
    .eq('period', period)
    .maybeSingle();

  const used = (data as { credits?: number } | null)?.credits ?? 0;

  return { used, limit, remaining: Math.max(0, limit - used), period };
}

/**
 * Respuesta 429 cuando se agotan los créditos del mes. Va con
 * `creditsExhausted: true` para que el cliente lo distinga del rate limiting y
 * ofrezca mejorar el plan en lugar de pedir que se reintente.
 */
export function creditsExhaustedResponse(
  result: CreditsResult,
  language: 'es' | 'en' = 'es',
): NextResponse {
  const message = language === 'en'
    ? `You've used all ${result.limit} AI credits for this month. Upgrade your plan to keep creating.`
    : `Usaste tus ${result.limit} créditos de IA de este mes. Mejora tu plan para seguir creando.`;

  return NextResponse.json(
    {
      error: message,
      creditsExhausted: true,
      operation: result.operation,
      cost: result.cost,
      limit: result.limit,
      used: result.used,
    },
    { status: 429 },
  );
}
