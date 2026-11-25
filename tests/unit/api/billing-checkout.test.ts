// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

const stripeMock = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  subscriptions: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock('@/lib/stripe', () => ({
  default: stripeMock,
  getPriceId: (plan: string) => `price_${plan}`,
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

import { POST } from '@/app/api/billing/checkout/route';
import { getAuthFromRequest } from '@/lib/auth';

function checkout(plan: string) {
  return POST(new NextRequest('http://localhost/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, lang: 'es' }),
  }));
}

function sub(status: string, price: string, app = 'kefy') {
  return { id: `sub_${status}`, status, metadata: { app }, items: { data: [{ id: 'si_1', price: { id: price } }] } };
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    db.reset();
    vi.clearAllMocks();
    vi.mocked(getAuthFromRequest).mockResolvedValue({ userId: 'u1', orgId: 'o1', role: 'owner' } as never);
    db.seed('kefy_organizations', [{ id: 'o1', name: 'Org', stripe_customer_id: 'cus_1' }]);
    db.seed('kefy_users', [{ id: 'u1', email: 'a@b.c', name: 'A' }]);
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout' });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal' });
  });

  it('con una suscripción viva no crea otra: abre la confirmación del cambio de plan', async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub('active', 'price_starter')] });

    const res = await checkout('pro');
    expect(await res.json()).toEqual({ url: 'https://portal' });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1',
      flow_data: expect.objectContaining({
        type: 'subscription_update_confirm',
        subscription_update_confirm: { subscription: 'sub_active', items: [{ id: 'si_1', price: 'price_pro', quantity: 1 }] },
      }),
    }));
  });

  it('si el portal no admite el flujo, abre el portal normal en vez de un checkout', async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [sub('past_due', 'price_starter')] });
    stripeMock.billingPortal.sessions.create
      .mockRejectedValueOnce(new Error('subscription_update disabled'))
      .mockResolvedValueOnce({ url: 'https://portal-plain' });

    const res = await checkout('business');
    expect(await res.json()).toEqual({ url: 'https://portal-plain' });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('sin suscripción viva de Kefy (cancelada o de otro producto) usa el checkout', async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [sub('canceled', 'price_starter'), sub('active', 'price_other', 'depando')],
    });

    const res = await checkout('pro');
    expect(await res.json()).toEqual({ url: 'https://checkout' });
    expect(stripeMock.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});
