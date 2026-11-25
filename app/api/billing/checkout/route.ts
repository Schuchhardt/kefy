import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';
import stripe, { getPriceId } from '@/lib/stripe';
import { appUrl } from '@/lib/app-url';
import { reportError } from '@/lib/observability';
import type Stripe from 'stripe';
import type { BillingPlan } from '@/types/billing';
import { z } from 'zod';

const BodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'business']),
  /** Idioma al que vuelve Stripe. Antes era siempre /es/. */
  lang: z.enum(['es', 'en']).optional(),
});

/** Estados en que la suscripción sigue viva y un checkout nuevo la duplicaría. */
const LIVE = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

async function findLiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  // La cuenta de Stripe se comparte con otros productos: solo las de Kefy.
  return subs.data.find((s) => s.metadata?.app === 'kefy' && LIVE.has(s.status)) ?? null;
}

async function planChangeUrl(
  sub: Stripe.Subscription,
  priceId: string,
  customerId: string,
  successUrl: string,
  returnUrl: string,
  orgId: string,
): Promise<string> {
  const item = sub.items.data[0];
  if (item && item.price.id !== priceId && sub.status !== 'paused') {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: sub.id,
            items: [{ id: item.id, price: priceId, quantity: 1 }],
          },
          after_completion: { type: 'redirect', redirect: { return_url: successUrl } },
        },
      });
      return session.url;
    } catch (err) {
      // Si la configuración del portal no deja cambiar de plan, al menos el
      // portal normal: ahí se puede gestionar la suscripción sin duplicarla.
      reportError(err, { route: 'POST /api/billing/checkout', service: 'stripe', extra: { orgId, step: 'portal_flow' } });
    }
  }
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}

// ─── POST /api/billing/checkout ───────────────────────────────────────────────
// Creates a Stripe Checkout Session for a plan upgrade.
// Returns { url } — the frontend redirects the user there.

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'plan must be starter, pro, or business' }, { status: 422 });
  }

  const { plan, lang = 'es' } = parsed.data;

  let priceId: string;
  try {
    priceId = getPriceId(plan as BillingPlan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Price ID not configured';
    console.error('[billing/checkout] getPriceId error:', msg);
    return NextResponse.json({ error: 'Plan not available' }, { status: 503 });
  }

  const db = createSupabaseServer();

  // Get org to retrieve or create the Stripe customer
  const { data: org } = await db
    .from('kefy_organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', auth.orgId)
    .maybeSingle();

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  // Get user email for the customer
  const { data: user } = await db
    .from('kefy_users')
    .select('email, name')
    .eq('id', auth.userId)
    .maybeSingle();


  // El idioma no va en el JWT: lo manda la página (por defecto, 'es').
  const successUrl = `${appUrl()}/${lang}/dashboard/settings?billing=success#billing`;
  const cancelUrl  = `${appUrl()}/${lang}/dashboard/settings?billing=canceled#billing`;

  let customerId = org.stripe_customer_id ?? undefined;

  // Create Stripe customer if the org doesn't have one yet
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email,
      name:  user?.name ?? org.name,
      metadata: { org_id: auth.orgId, app: 'kefy' },
    });
    customerId = customer.id;

    // Persist the new customer ID
    await db
      .from('kefy_organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', auth.orgId);
  }

  // Quien ya paga no pasa por un checkout nuevo: eso creaba una segunda
  // suscripción y se cobraban las dos. El cambio de plan se hace sobre la
  // suscripción vigente, en el portal, que muestra el prorrateo y pide
  // confirmación. El plan nuevo lo guarda el webhook (sale del precio).
  if (org.stripe_customer_id) {
    const live = await findLiveSubscription(org.stripe_customer_id);
    if (live) {
      const url = await planChangeUrl(live, priceId, org.stripe_customer_id, successUrl, cancelUrl, auth.orgId);
      return NextResponse.json({ url });
    }
  }

  // Create the Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    metadata: {
      org_id: auth.orgId,
      plan,
      app: 'kefy',
    },
    subscription_data: {
      metadata: { org_id: auth.orgId, plan, app: 'kefy' },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
