// ─── Planes: una sola fuente de verdad ───────────────────────────────────────
//
// Precios y topes de cada plan, sin dependencias de servidor para que los
// puedan leer tanto las rutas como los componentes (Ajustes → Plan).
// lib/usage.ts (créditos, mensajes del asistente), lib/brands.ts (marcas) y
// lib/team.ts (miembros) exportan sus tablas a partir de esta.
//
// Antes cada sitio tenía sus números: Ajustes mostraba Starter a $19 y Pro a
// $69 con «Marcas ilimitadas» mientras la landing y Stripe cobraban $49/$99 y
// 15 marcas. tests/unit/lib/plans.test.ts compara esta tabla con la copy de la
// landing en los dos idiomas.
//
// El precio real lo decide Stripe (STRIPE_PRICE_* en lib/stripe.ts). Solo hay
// precios mensuales: la facturación anual que anunciaba la landing no existe.

import type { BillingPlan } from '@/types/billing';
import esPlans from '@/locales/es/plans';
import enPlans from '@/locales/en/plans';

export const PLAN_ORDER: readonly BillingPlan[] = ['starter', 'pro', 'business'];

/**
 * Créditos que cuesta cada operación (lib/usage.ts los reexporta como
 * CREDIT_COSTS). Viven aquí, sin dependencias de servidor, para que la UI
 * pueda decir cuánto va a costar algo antes de hacerlo (p. ej. el onboarding).
 */
export const OPERATION_CREDIT_COSTS = {
  text:   1,   // una llamada a Claude/GPT
  image:  3,   // generación de imagen + procesado + subida
  video: 10,   // render en Remotion Lambda + alojamiento
} as const;

/** Duración del mes gratis que recibe toda cuenta nueva (en Starter). */
export const TRIAL_DAYS = 30;

/** Precio mensual en dólares. */
export const PLAN_PRICES_USD: Record<BillingPlan, number> = {
  starter: 49,
  pro: 99,
  business: 199,
};

export interface PlanLimits {
  brands: number;
  /** Créditos de IA al mes (texto 1, imagen 3, video 10). */
  credits: number;
  /** Mensajes al asistente al mes (no gastan créditos). */
  assistantMessages: number;
  /** Miembros del equipo, contando al dueño. */
  members: number;
  /**
   * Cuentas de redes conectables. Se anuncia en precios pero todavía no se
   * aplica al conectar (ver docs/auditoria-ux.md, «Hallazgos adicionales»).
   */
  socialConnections: number;
}

export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  starter: { brands: 1, credits: 150, assistantMessages: 300, members: 1, socialConnections: 3 },
  pro: { brands: 5, credits: 500, assistantMessages: 1500, members: 1, socialConnections: 20 },
  business: { brands: 15, credits: 2000, assistantMessages: 5000, members: 5, socialConnections: 60 },
};

/** El plan más popular: se destaca en la landing y en Ajustes. */
export const FEATURED_PLAN: BillingPlan = 'pro';

export function isBillingPlan(value: unknown): value is BillingPlan {
  return typeof value === 'string' && (PLAN_ORDER as readonly string[]).includes(value);
}

/** Número con separador de miles del idioma («1.500» / «1,500»). */
export function formatPlanNumber(n: number, lang: string): string {
  return n.toLocaleString(lang === 'en' ? 'en-US' : 'es-ES', { useGrouping: n >= 1000 ? 'always' : false } as Intl.NumberFormatOptions);
}

// ─── Descripción para la UI ──────────────────────────────────────────────────

/** Líneas de un plan con sus topes, en el idioma pedido. */
export function planHighlights(plan: BillingPlan, lang: string): string[] {
  const t = lang === 'en' ? enPlans : esPlans;
  const l = PLAN_LIMITS[plan];
  const n = (v: number) => formatPlanNumber(v, lang);
  return [
    t.brands(n(l.brands)),
    t.socialConnections(n(l.socialConnections)),
    t.credits(n(l.credits)),
    t.assistantMessages(n(l.assistantMessages)),
    t.members(n(l.members)),
  ];
}

/** Lo que incluyen todos los planes (no cambia entre ellos). */
export function planIncluded(lang: string): string[] {
  return [...(lang === 'en' ? enPlans : esPlans).included];
}

export function planName(plan: BillingPlan, lang: string): string {
  return (lang === 'en' ? enPlans : esPlans).names[plan];
}
