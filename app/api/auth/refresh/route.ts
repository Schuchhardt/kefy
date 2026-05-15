import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  accessCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  const rawRefresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!rawRefresh) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const tokenHash = hashToken(rawRefresh);
  const db = createSupabaseServer();

  const { data: storedToken } = await db
    .from('refresh_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!storedToken) {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }

  if (new Date(storedToken.expires_at) < new Date()) {
    // Clean up expired token
    await db.from('refresh_tokens').delete().eq('id', storedToken.id);
    const res = NextResponse.json({ error: 'Refresh token expired' }, { status: 401 });
    res.cookies.set(REFRESH_COOKIE, '', clearCookieOptions('/api/auth/refresh'));
    res.cookies.set(ACCESS_COOKIE, '', clearCookieOptions());
    return res;
  }

  // Rotate: delete old token, issue new one
  await db.from('refresh_tokens').delete().eq('id', storedToken.id);

  const { data: membership } = await db
    .from('org_memberships')
    .select('org_id, role, organizations(plan)')
    .eq('user_id', storedToken.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'User has no organization' }, { status: 500 });
  }

  const org = membership.organizations as unknown as { plan: string } | null;
  const plan = (org?.plan ?? 'starter') as 'starter' | 'pro' | 'business';
  const role = membership.role as 'owner' | 'admin' | 'member';

  const newAccessToken = await signAccessToken({
    userId: storedToken.user_id,
    orgId: membership.org_id,
    role,
    plan,
  });

  const { raw: newRefreshRaw, hash: newRefreshHash, expiresAt } = generateRefreshToken();
  await db.from('refresh_tokens').insert({
    user_id: storedToken.user_id,
    token_hash: newRefreshHash,
    expires_at: expiresAt.toISOString(),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, newAccessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, newRefreshRaw, refreshCookieOptions());
  return res;
}
