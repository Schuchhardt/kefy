import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, ACCESS_COOKIE } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { connectOAuthAccount } from '@/lib/services/social-integrity';

// ─── GET /api/social/oauth/callback ──────────────────────────────────────────
// Handles the redirect from Zernio after a successful OAuth connection.
//
// Zernio standard mode appends:
//   ?connected={platform}&profileId=X&accountId=Y&username=Z
//
// La cuenta se confirma con Zernio antes de guardarla (lib/services/social-integrity.ts).

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);

  const connected  = searchParams.get('connected');   // platform name
  const username   = searchParams.get('username');

  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/dashboard/settings';
  const settingsUrl = `${origin}${safeReturnTo}`;

  if (!connected) {
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

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  const out = await connectOAuthAccount(ctx, {
    platform:  connected,
    // Some platforms (e.g. Facebook) don't include accountId in the redirect.
    accountId: searchParams.get('accountId'),
    username,
  });
  if (!out.ok) return NextResponse.redirect(`${settingsUrl}?error=${out.error}`);

  const successUrl = `${settingsUrl}?connected=${encodeURIComponent(connected)}`;
  const res = NextResponse.redirect(successUrl);
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
