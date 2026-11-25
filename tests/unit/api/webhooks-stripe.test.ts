// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
// La firma es de Stripe: aquí el evento es el cuerpo tal cual.
const retrieveSubscription = vi.fn();
vi.mock('@/lib/stripe', () => ({
  default: {
    webhooks: { constructEvent: (raw: string) => JSON.parse(raw) },
    subscriptions: { retrieve: (id: string) => retrieveSubscription(id) },
  },
}));

import { POST } from '@/app/api/webhooks/stripe/route';

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_PRICE_STARTER = 'price_starter';
process.env.STRIPE_PRICE_PRO = 'price_pro';
process.env.STRIPE_PRICE_BUSINESS = 'price_business';

function send(event: unknown) {
  return POST(new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: JSON.stringify(event),
    headers: { 'stripe-signature': 't=1,v1=x' },
  }));
}

function subscriptionObject(sub: { id: string; price: string; plan: string; status: string }) {
  return {
    id: sub.id,
    status: sub.status,
    customer: 'cus_1',
    metadata: { app: 'kefy', org_id: 'o1', plan: sub.plan },
    items: { data: [{ price: { id: sub.price }, current_period_start: 1_700_000_000, current_period_end: 1_702_600_000 }] },
  };
}

function subscriptionEvent(type: string, sub: { id: string; price: string; plan: string; status: string }) {
  return { type, data: { object: subscriptionObject(sub) } };
}

describe('POST /api/webhooks/stripe — plan de la suscripción', () => {
  beforeEach(() => {
    db.reset();
    db.seed('kefy_organizations', [{ id: 'o1', plan: 'business', stripe_customer_id: 'cus_1' }]);
    db.seed('kefy_subscriptions', [{ id: 's1', org_id: 'o1', stripe_subscription_id: 'sub_1', plan: 'business', status: 'active' }]);
  });

  it('toma el plan del precio cobrado, no de la metadata del checkout', async () => {
    // Bajó de Business a Starter desde el portal: la metadata sigue diciendo business.
    const res = await send(subscriptionEvent('customer.subscription.updated', {
      id: 'sub_1', price: 'price_starter', plan: 'business', status: 'active',
    }));
    expect(res.status).toBe(200);
    expect(db.rows('kefy_organizations')[0].plan).toBe('starter');
    expect(db.rows('kefy_subscriptions')[0].plan).toBe('starter');
  });

  it('usa la metadata si el precio no es uno de los configurados', async () => {
    await send(subscriptionEvent('customer.subscription.updated', {
      id: 'sub_1', price: 'price_legacy', plan: 'pro', status: 'active',
    }));
    expect(db.rows('kefy_organizations')[0].plan).toBe('pro');
  });
});

describe('POST /api/webhooks/stripe — fallos de la base', () => {
  beforeEach(() => {
    db.reset();
    db.seed('kefy_organizations', [{ id: 'o1', plan: 'starter', stripe_customer_id: 'cus_1' }]);
    db.seed('kefy_subscriptions', [{ id: 's1', org_id: 'o1', stripe_subscription_id: 'sub_1', plan: 'starter', status: 'trialing' }]);
  });

  it('responde 500 para que Stripe reintente si no se pudo guardar la suscripción', async () => {
    db.failNext('kefy_subscriptions', 'upsert');
    const evt = subscriptionEvent('customer.subscription.updated', {
      id: 'sub_1', price: 'price_pro', plan: 'pro', status: 'active',
    });
    expect((await send(evt)).status).toBe(500);
    expect(db.rows('kefy_subscriptions')[0].status).toBe('trialing');

    // El reintento de Stripe sí lo guarda.
    expect((await send(evt)).status).toBe(200);
    expect(db.rows('kefy_subscriptions')[0]).toMatchObject({ status: 'active', plan: 'pro' });
  });

  it('ignora estados que la tabla no admite en vez de fallar para siempre', async () => {
    const res = await send(subscriptionEvent('customer.subscription.updated', {
      id: 'sub_1', price: 'price_pro', plan: 'pro', status: 'incomplete',
    }));
    expect(res.status).toBe(200);
    expect(db.rows('kefy_subscriptions')[0]).toMatchObject({ status: 'trialing', plan: 'starter' });
  });
});

describe('POST /api/webhooks/stripe — dos suscripciones', () => {
  beforeEach(() => {
    db.reset();
    db.seed('kefy_organizations', [{ id: 'o1', plan: 'pro', stripe_customer_id: 'cus_1' }]);
    db.seed('kefy_subscriptions', [{ id: 's1', org_id: 'o1', stripe_subscription_id: 'sub_new', plan: 'pro', status: 'active' }]);
  });

  it('cancelar la suscripción vieja no deja cancelada a la vigente', async () => {
    const res = await send(subscriptionEvent('customer.subscription.deleted', {
      id: 'sub_old', price: 'price_starter', plan: 'starter', status: 'canceled',
    }));
    expect(res.status).toBe(200);
    expect(db.rows('kefy_subscriptions')[0]).toMatchObject({ stripe_subscription_id: 'sub_new', status: 'active', plan: 'pro' });
    expect(db.rows('kefy_organizations')[0].plan).toBe('pro');
  });

  it('la que cancela es la vigente: sí queda cancelada', async () => {
    await send(subscriptionEvent('customer.subscription.deleted', {
      id: 'sub_new', price: 'price_pro', plan: 'pro', status: 'canceled',
    }));
    expect(db.rows('kefy_subscriptions')[0].status).toBe('canceled');
  });
});

describe('POST /api/webhooks/stripe — checkout completado', () => {
  beforeEach(() => {
    db.reset();
    retrieveSubscription.mockReset();
    db.seed('kefy_organizations', [{ id: 'o1', plan: 'starter', stripe_customer_id: null }]);
    db.seed('kefy_subscriptions', [{ id: 's1', org_id: 'o1', stripe_subscription_id: null, plan: 'starter', status: 'trialing' }]);
  });

  function checkoutEvent() {
    return {
      type: 'checkout.session.completed',
      data: { object: { metadata: { app: 'kefy', org_id: 'o1', plan: 'pro' }, customer: 'cus_1', subscription: 'sub_1', payment_status: 'unpaid' } },
    };
  }

  it('con el pago pendiente no marca la suscripción como activa', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionObject({ id: 'sub_1', price: 'price_pro', plan: 'pro', status: 'incomplete' }));

    expect((await send(checkoutEvent())).status).toBe(200);
    expect(db.rows('kefy_subscriptions')[0]).toMatchObject({ status: 'trialing', plan: 'starter' });
    expect(db.rows('kefy_organizations')[0]).toMatchObject({ stripe_customer_id: 'cus_1', plan: 'starter' });
  });

  it('con el pago hecho guarda el estado, el plan y el período de la suscripción', async () => {
    retrieveSubscription.mockResolvedValue(subscriptionObject({ id: 'sub_1', price: 'price_pro', plan: 'pro', status: 'active' }));

    await send(checkoutEvent());
    expect(db.rows('kefy_subscriptions')[0]).toMatchObject({
      stripe_subscription_id: 'sub_1', status: 'active', plan: 'pro',
      current_period_end: new Date(1_702_600_000 * 1000).toISOString(),
    });
    expect(db.rows('kefy_organizations')[0].plan).toBe('pro');
  });
});
