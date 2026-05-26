import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
});

export default stripe;

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
