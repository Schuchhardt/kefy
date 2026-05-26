import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';
import stripe, { getPriceId, type BillingPlan } from '@/lib/stripe';
import { z } from 'zod';

const BodySchema = z.object({
  plan: z.enum(['starter', 'pro', 'business']),
});

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

  const { plan } = parsed.data;

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3097';

  // Determine success/cancel URLs — lang not stored in JWT, default to 'es'
  const successUrl = `${appUrl}/es/dashboard/settings?billing=success`;
  const cancelUrl  = `${appUrl}/es/dashboard/settings?billing=canceled`;

  let customerId = org.stripe_customer_id ?? undefined;

  // Create Stripe customer if the org doesn't have one yet
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user?.email,
      name:  user?.name ?? org.name,
      metadata: { org_id: auth.orgId },
    });
    customerId = customer.id;

    // Persist the new customer ID
    await db
      .from('kefy_organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', auth.orgId);
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
    },
    subscription_data: {
      metadata: { org_id: auth.orgId, plan },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
