import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { createSupabaseServer } from '@/lib/supabase';
import type Stripe from 'stripe';

// ─── POST /api/webhooks/stripe ────────────────────────────────────────────────
// Receives and processes Stripe webhook events.
// Syncs subscription state into kefy_subscriptions + kefy_organizations.plan

type Plan = 'starter' | 'pro' | 'business';

function planFromMetadata(metadata: Stripe.Metadata | null): Plan {
  const p = metadata?.plan;
  if (p === 'pro' || p === 'business') return p;
  return 'starter';
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.org_id;
  const plan  = planFromMetadata(session.metadata);
  if (!orgId) return;

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  const db = createSupabaseServer();

  // Persist customer ID on org
  if (customerId) {
    await db
      .from('kefy_organizations')
      .update({ stripe_customer_id: customerId, plan })
      .eq('id', orgId);
  }

  // Upsert subscription record
  await db
    .from('kefy_subscriptions')
    .upsert(
      {
        org_id:                orgId,
        stripe_subscription_id: subscriptionId,
        plan,
        status: 'active',
      },
      { onConflict: 'org_id' },
    );
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    // Fallback: look up org by stripe_customer_id
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    if (!customerId) return;

    const db = createSupabaseServer();
    const { data: org } = await db
      .from('kefy_organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (!org) return;
    return syncSubscription(org.id, subscription);
  }
  return syncSubscription(orgId, subscription);
}

async function syncSubscription(orgId: string, subscription: Stripe.Subscription) {
  const plan   = planFromMetadata(subscription.metadata);
  const status = subscription.status as 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

  const periodStart = subscription.items.data[0]?.current_period_start
    ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;

  const effectivePlan: Plan = (status === 'canceled' || status === 'unpaid') ? 'starter' : plan;

  const db = createSupabaseServer();

  await db
    .from('kefy_subscriptions')
    .upsert(
      {
        org_id:                 orgId,
        stripe_subscription_id: subscription.id,
        plan:                   effectivePlan,
        status,
        current_period_start:   periodStart,
        current_period_end:     periodEnd,
      },
      { onConflict: 'org_id' },
    );

  await db
    .from('kefy_organizations')
    .update({ plan: effectivePlan })
    .eq('id', orgId);
}

export async function POST(req: NextRequest) {
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe client not configured';
    console.error('[stripe webhook] stripe config error:', msg);
    return NextResponse.json({ error: 'Stripe service not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing stripe signature or webhook secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed';
    console.error('[stripe webhook] verification error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook handler error';
    console.error('[stripe webhook] handler error:', msg, 'event:', event.type);
    // Return 200 to prevent Stripe from retrying non-critical errors
    return NextResponse.json({ received: true, warning: msg });
  }

  return NextResponse.json({ received: true });
}
