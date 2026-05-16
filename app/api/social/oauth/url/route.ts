import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/social/oauth/url ────────────────────────────────────────────────
// Returns the Zernio OAuth URL to redirect the user to for a given platform.
//
// Query params:
//   platform      — required
//   redirect_uri  — required (your app's callback URL)
//   state         — optional CSRF state token (recommended)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const platform    = searchParams.get('platform');
  const redirectUri = searchParams.get('redirect_uri');
  const state       = searchParams.get('state') ?? crypto.randomUUID();

  const VALID_PLATFORMS = new Set(['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads']);

  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `platform must be one of: ${[...VALID_PLATFORMS].join(', ')}` },
      { status: 422 },
    );
  }
  if (!redirectUri) {
    return NextResponse.json({ error: 'redirect_uri is required' }, { status: 422 });
  }

  const { buildOAuthUrl } = await import('@/lib/zernio');
  const url = buildOAuthUrl(
    platform as import('@/lib/zernio').ZernioPlatform,
    redirectUri,
    state,
  );

  return NextResponse.json({ url, state });
}
