// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
// La firma es de Stripe: aquí el evento es el cuerpo tal cual.
vi.mock('@/lib/stripe', () => ({
  default: { webhooks: { constructEvent: (raw: string) => JSON.parse(raw) } },
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

function subscriptionEvent(type: string, sub: { id: string; price: string; plan: string; status: string }) {
  return {
    type,
    data: {
      object: {
        id: sub.id,
        status: sub.status,
        customer: 'cus_1',
        metadata: { app: 'kefy', org_id: 'o1', plan: sub.plan },
        items: { data: [{ price: { id: sub.price }, current_period_start: 1_700_000_000, current_period_end: 1_702_600_000 }] },
      },
    },
  };
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
