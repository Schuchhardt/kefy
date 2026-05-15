import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import {
  signAccessToken,
  generateRefreshToken,
  accessCookieOptions,
  refreshCookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '@/lib/auth';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  const sanitizedEmail = email.trim().toLowerCase();
  const db = createSupabaseServer();

  const { data: user } = await db
    .from('kefy_users')
    .select('id, email, name, password_hash')
    .eq('email', sanitizedEmail)
    .maybeSingle();

  // Constant-time comparison (run hash even on miss to prevent timing attacks)
  const hashToCompare = user?.password_hash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Get membership (most recent org, prefer owner role)
  const { data: membership } = await db
    .from('kefy_org_memberships')
    .select('org_id, role, kefy_organizations(plan)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 500 });
  }

  const org = membership.kefy_organizations as unknown as { plan: string } | null;
  const plan = (org?.plan ?? 'starter') as 'starter' | 'pro' | 'business';
  const role = membership.role as 'owner' | 'admin' | 'member';

  const accessToken = await signAccessToken({
    userId: user.id,
    orgId: membership.org_id,
    role,
    plan,
  });

  const { raw: refreshRaw, hash: refreshHash, expiresAt } = generateRefreshToken();

  await db.from('kefy_refresh_tokens').insert({
    user_id: user.id,
    token_hash: refreshHash,
    expires_at: expiresAt.toISOString(),
  });

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    orgId: membership.org_id,
  });
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshRaw, refreshCookieOptions());
  return res;
}
