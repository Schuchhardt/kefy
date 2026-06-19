import Stripe from 'stripe';

let _stripe: Stripe | undefined;

function getStripeInstance(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
    });
  }
  return _stripe;
}

// Lazy proxy — defers initialization to request time, not module evaluation,
// so the build succeeds even when STRIPE_SECRET_KEY is not in the build env.
const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripeInstance(), prop as string);
  },
});

export default stripe;

// ─── Plan → Price ID map ──────────────────────────────────────────────────────

import type { BillingPlan } from '@/types/billing';

export function getPriceId(plan: BillingPlan): string {
  const ids: Record<BillingPlan, string | undefined> = {
    starter:  process.env.STRIPE_PRICE_STARTER,
    pro:      process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
  };
  const id = ids[plan];
  if (!id) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} is not set`);
  return id;
}
