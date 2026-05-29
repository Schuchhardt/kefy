import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  if (!stripe) {
    stripe = new Stripe(secret, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
    });
  }

  return stripe;
}

// ─── Plan → Price ID map ──────────────────────────────────────────────────────

export type BillingPlan = 'starter' | 'pro' | 'business';

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
