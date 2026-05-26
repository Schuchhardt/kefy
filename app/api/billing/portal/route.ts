import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';
import stripe from '@/lib/stripe';

// ─── POST /api/billing/portal ─────────────────────────────────────────────────
// Creates a Stripe Customer Portal session for managing an existing subscription.
// Returns { url } — the frontend redirects the user there.

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServer();

  const { data: org } = await db
    .from('kefy_organizations')
    .select('stripe_customer_id')
    .eq('id', auth.orgId)
    .maybeSingle();

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer found. Please subscribe first.' },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3097';
  const returnUrl = `${appUrl}/es/dashboard/settings`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   org.stripe_customer_id,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: portalSession.url });
}
