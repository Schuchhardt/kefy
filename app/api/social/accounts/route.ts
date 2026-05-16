import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/social/accounts ────────────────────────────────────────────────
// List connected social accounts for the org.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServer();

  const { data: accounts, error } = await db
    .from('kefy_social_accounts')
    .select('id, platform, external_id, username, avatar_url, zernio_account_id, status, token_expires_at, created_at')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('social accounts GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  return NextResponse.json({ accounts: accounts ?? [] });
}

// ─── POST /api/social/accounts ───────────────────────────────────────────────
// Connect a social account after OAuth callback.
// The frontend completes the OAuth flow → receives code → calls this endpoint.
//
// Body:
//   platform      — required
//   code          — OAuth authorization code
//   redirect_uri  — must match what was used in the OAuth flow

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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  const VALID_PLATFORMS = new Set(['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads']);

  if (!input.platform || !VALID_PLATFORMS.has(input.platform as string)) {
    return NextResponse.json(
      { error: `platform must be one of: ${[...VALID_PLATFORMS].join(', ')}` },
      { status: 422 },
    );
  }
  if (typeof input.code !== 'string' || !input.code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 422 });
  }
  if (typeof input.redirect_uri !== 'string' || !input.redirect_uri.trim()) {
    return NextResponse.json({ error: 'redirect_uri is required' }, { status: 422 });
  }

  // Exchange code with Zernio
  const { connectAccount } = await import('@/lib/zernio');
  let connected;
  try {
    connected = await connectAccount(
      input.platform as import('@/lib/zernio').ZernioPlatform,
      input.code as string,
      input.redirect_uri as string,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to connect account';
    console.error('Zernio connect error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const db = createSupabaseServer();

  // Upsert by (org_id, platform, external_id)
  const { data: account, error } = await db
    .from('kefy_social_accounts')
    .upsert(
      {
        org_id:            auth.orgId,
        platform:          input.platform,
        external_id:       connected.account.external_id,
        username:          connected.account.username,
        avatar_url:        connected.account.avatar_url ?? null,
        access_token:      connected.access_token,
        refresh_token:     connected.refresh_token ?? null,
        token_expires_at:  connected.expires_at ?? null,
        zernio_account_id: connected.account.id,
        status:            'active',
      },
      { onConflict: 'org_id,platform,external_id' },
    )
    .select('id, platform, username, avatar_url, status, created_at')
    .single();

  if (error || !account) {
    console.error('social account upsert error:', error?.message);
    return NextResponse.json({ error: 'Failed to save account' }, { status: 500 });
  }

  return NextResponse.json({ account }, { status: 201 });
}
