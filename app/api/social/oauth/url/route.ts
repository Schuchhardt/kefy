import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';

// ─── GET /api/social/oauth/url ────────────────────────────────────────────────
// Returns the Zernio OAuth URL to redirect the user to for a given platform.
// Automatically creates a Zernio profile for the org if one doesn't exist yet.
//
// Query params:
//   platform — required
//   state    — optional CSRF state token (recommended)

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const state    = searchParams.get('state') ?? crypto.randomUUID();

  const VALID_PLATFORMS = new Set<string>([
    'facebook', 'instagram', 'linkedin', 'twitter', 'tiktok', 'youtube',
    'threads', 'reddit', 'pinterest', 'bluesky', 'googlebusiness',
    'telegram', 'snapchat', 'discord', 'whatsapp',
  ]);

  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `platform must be one of: ${[...VALID_PLATFORMS].join(', ')}` },
      { status: 422 },
    );
  }

  const db = createSupabaseServer();

  // Fetch the org to get (or create) its Zernio profile
  const { data: org, error: orgError } = await db
    .from('kefy_organizations')
    .select('id, name, zernio_profile_id')
    .eq('id', auth.orgId)
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const { createProfile, getConnectUrl } = await import('@/lib/zernio');

  let profileId: string = org.zernio_profile_id ?? '';

  // Create a Zernio profile for this org if it doesn't have one yet
  if (!profileId) {
    let zernioProfile;
    try {
      zernioProfile = await createProfile(org.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Zernio createProfile error:', msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    profileId = zernioProfile._id;

    const { error: updateError } = await db
      .from('kefy_organizations')
      .update({ zernio_profile_id: profileId })
      .eq('id', auth.orgId);

    if (updateError) {
      console.error('Failed to save zernio_profile_id:', updateError.message);
      return NextResponse.json({ error: 'Failed to save Zernio profile' }, { status: 500 });
    }
  }

  // Get the OAuth URL from Zernio (standard mode — Zernio redirects back with accountId)
  let authUrl: string;
  try {
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin}/api/social/oauth/callback`;
    const result = await getConnectUrl(
      platform as import('@/lib/zernio').ZernioPlatform,
      profileId,
      redirectUrl,
    );
    authUrl = result.authUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Zernio getConnectUrl error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ url: authUrl, state });
}
