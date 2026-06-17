import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { verifyAccessToken, ACCESS_COOKIE } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { listAccounts } from '@/lib/zernio';

// ─── GET /api/social/oauth/callback ──────────────────────────────────────────
// Handles the redirect from Zernio after a successful OAuth connection.
//
// Zernio standard mode appends:
//   ?connected={platform}&profileId=X&accountId=Y&username=Z
//
// We save the account to the DB and redirect the user back to settings.

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);

  const connected  = searchParams.get('connected');   // platform name
  const profileId  = searchParams.get('profileId');
  const username   = searchParams.get('username');

  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/dashboard/settings';
  const settingsUrl = `${origin}${safeReturnTo}`;

  if (!connected) {
    return NextResponse.redirect(`${settingsUrl}?error=oauth_failed`);
  }

  // Some platforms (e.g. Facebook) don't include accountId in the redirect.
  // Fetch the freshly-connected account from Zernio instead.
  let accountId = searchParams.get('accountId');
  if (!accountId && profileId) {
    try {
      const accounts = await listAccounts({ profileId, platform: connected });
      const match = accounts.find(a => a.username === username) ?? accounts[0];
      accountId = match?.id ?? null;
    } catch (e) {
      console.error('OAuth callback: failed to resolve accountId from Zernio', e);
    }
  }

  if (!accountId) {
    console.error('OAuth callback: accountId missing for', connected);
    return NextResponse.redirect(`${settingsUrl}?error=oauth_failed`);
  }

  // Identify the user from the access cookie
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.redirect(`${origin}/login?redirect=${encodeURIComponent(safeReturnTo)}`);
  }

  const auth = await verifyAccessToken(accessToken);
  if (!auth) {
    return NextResponse.redirect(`${origin}/login?redirect=${encodeURIComponent(safeReturnTo)}`);
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) {
    return NextResponse.redirect(`${settingsUrl}?error=no_brand`);
  }

  const db = createSupabaseServer();

  // Upsert the connected account — Zernio owns the tokens, we just store the reference
  const { error } = await db
    .from('kefy_social_accounts')
    .upsert(
      {
        org_id:            auth.orgId,
        brand_id:          brand.id,
        platform:          connected,
        external_id:       accountId,
        username:          username ?? accountId,
        avatar_url:        null,
        access_token:      '',           // tokens managed by Zernio
        refresh_token:     null,
        token_expires_at:  null,
        zernio_account_id: accountId,
        status:            'active',
      },
      { onConflict: 'brand_id,platform,external_id' },
    );

  if (error) {
    console.error('OAuth callback upsert error:', error.message);
    return NextResponse.redirect(`${settingsUrl}?error=save_failed`);
  }

  const successUrl = `${settingsUrl}?connected=${encodeURIComponent(connected)}`;
  const res = NextResponse.redirect(successUrl);
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
