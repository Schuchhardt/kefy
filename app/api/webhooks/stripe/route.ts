import { NextRequest, NextResponse } from 'next/server';
import stripe from '@/lib/stripe';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import type Stripe from 'stripe';
import type { BillingPlan } from '@/types/billing';
import type { SubscriptionStatus } from '@/lib/subscription';

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

// ─── POST /api/webhooks/stripe ─────────────────────────────────────────────────────────────────
// Receives and processes Stripe webhook events.
// Syncs subscription state into kefy_subscriptions + kefy_organizations.plan

function planFromMetadata(metadata: Stripe.Metadata | null): BillingPlan {
  const p = metadata?.plan;
  if (p === 'pro' || p === 'business') return p;
  return 'starter';
}

/**
 * El plan que de verdad se cobra: el del precio de la suscripción. La
 * metadata `plan` se escribe solo al crear el checkout y Stripe no la cambia
 * cuando el cliente pasa a otro precio desde el portal; con ella, quien bajaba
 * de Business a Starter seguía con los créditos y marcas de Business (y quien
 * subía, sin ellos). La metadata queda como respaldo si el precio no es uno de
 * los STRIPE_PRICE_* configurados.
 */
function planFromSubscription(subscription: Stripe.Subscription): BillingPlan {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId) {
    const byPrice: Array<[BillingPlan, string | undefined]> = [
      ['starter', process.env.STRIPE_PRICE_STARTER],
      ['pro', process.env.STRIPE_PRICE_PRO],
      ['business', process.env.STRIPE_PRICE_BUSINESS],
    ];
    const match = byPrice.find(([, id]) => id && id === priceId);
    if (match) return match[0];
  }
  return planFromMetadata(subscription.metadata);
}

/**
 * Un fallo de la base no puede tragarse: si el webhook responde 200, Stripe
 * no reintenta y la organización se queda sin su pago registrado (bloqueada
 * con el trial vencido aunque pague, o con el plan anterior).
 */
function throwOnDbError(res: { error: { message: string } | null }, step: string): void {
  if (res.error) throw new Error(`${step}: ${res.error.message}`);
}

/**
 * Estados de Stripe → los que admite `kefy_subscriptions.status`. `incomplete`
 * (primer cobro aún sin confirmar, p. ej. un medio de pago asíncrono) e
 * `incomplete_expired` (ese cobro nunca llegó) no dan ni quitan nada: se
 * ignoran y manda el siguiente evento. Guardarlos violaba el CHECK de la tabla
 * y, ahora que el webhook responde 500 ante un fallo, Stripe reintentaría
 * durante días.
 */
const STATUS_FROM_STRIPE: Partial<Record<Stripe.Subscription.Status, SubscriptionStatus>> = {
  active:   'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid:   'unpaid',
  paused:   'unpaid',
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // This Stripe account is shared with other products (e.g. Depando) whose
  // events can land on this same endpoint — only touch sessions Kefy created.
  if (session.metadata?.app !== 'kefy') return;

  const orgId = session.metadata?.org_id;
  if (!orgId) return;

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;

  if (customerId) {
    const db = createSupabaseServer();
    throwOnDbError(await db
      .from('kefy_organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', orgId), 'kefy_organizations');
  }

  // Completar el checkout no es haber pagado: con un medio de pago asíncrono
  // la sesión termina con payment_status 'unpaid' y la suscripción queda
  // `incomplete`. El estado y el plan salen de la suscripción misma; cuando el
  // pago se confirme llega customer.subscription.updated con `active`.
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(orgId, subscription);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  // Same shared-account guard as handleCheckoutCompleted.
  if (subscription.metadata?.app !== 'kefy') return;

  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    // Fallback: look up org by stripe_customer_id
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    if (!customerId) return;

    const db = createSupabaseServer();
    const orgRes = await db
      .from('kefy_organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    throwOnDbError(orgRes, 'kefy_organizations');
    const org = orgRes.data;
    if (!org) return;
    return syncSubscription(org.id, subscription);
  }
  return syncSubscription(orgId, subscription);
}

async function syncSubscription(orgId: string, subscription: Stripe.Subscription) {
  const status = STATUS_FROM_STRIPE[subscription.status];
  if (!status) return;
  const plan = planFromSubscription(subscription);

  const periodStart = subscription.items.data[0]?.current_period_start
    ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;

  // El plan se guarda siempre tal cual, también al cancelar o impagar: no hay
  // plan gratuito al que caer. Lo que corta la creación de contenido es el
  // `status`, no el plan — así el usuario conserva el acceso a lo que ya creó y
  // basta con reactivar el pago para que todo vuelva (ver lib/subscription.ts).
  const db = createSupabaseServer();

  // Hay una fila por organización. Si la que manda es otra suscripción viva,
  // un evento de esta que no la deja activa (la vieja que se cancela tras
  // haber contratado otra, o un evento atrasado) no puede pisarla: dejaba la
  // cuenta en `canceled` con la suscripción nueva cobrando.
  const currentRes = await db
    .from('kefy_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('org_id', orgId)
    .maybeSingle();
  throwOnDbError(currentRes, 'kefy_subscriptions');
  const current = currentRes.data as { stripe_subscription_id: string | null; status: string } | null;
  if (
    current?.stripe_subscription_id
    && current.stripe_subscription_id !== subscription.id
    && LIVE_STATUSES.has(current.status)
    && status !== 'active' && status !== 'trialing'
  ) {
    return;
  }

  throwOnDbError(await db
    .from('kefy_subscriptions')
    .upsert(
      {
        org_id:                 orgId,
        stripe_subscription_id: subscription.id,
        plan,
        status,
        current_period_start:   periodStart,
        current_period_end:     periodEnd,
      },
      { onConflict: 'org_id' },
    ), 'kefy_subscriptions');

  throwOnDbError(await db
    .from('kefy_organizations')
    .update({ plan })
    .eq('id', orgId), 'kefy_organizations');
}

export async function POST(req: NextRequest) {
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
    reportError(err, { route: 'POST /api/webhooks/stripe', service: 'stripe', extra: { event: event.type } });
    // 500 para que Stripe reintente: los handlers son idempotentes (upsert por
    // org_id), así que repetir el evento no duplica nada.
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
