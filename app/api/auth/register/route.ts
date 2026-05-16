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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
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

  const { email, password, name, orgName } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof orgName !== 'string' || !orgName.trim()) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }

  const sanitizedEmail   = email.trim().toLowerCase();
  const sanitizedName    = name.trim().slice(0, 100);
  const sanitizedOrgName = orgName.trim().slice(0, 100);

  const db = createSupabaseServer();

  // Check email uniqueness
  const { data: existing } = await db
    .from('kefy_users')
    .select('id')
    .eq('email', sanitizedEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const { data: user, error: userError } = await db
    .from('kefy_users')
    .insert({ email: sanitizedEmail, password_hash: passwordHash, name: sanitizedName })
    .select('id')
    .single();

  if (userError || !user) {
    console.error('User creation error:', userError?.message);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  // Create org with unique slug
  const baseSlug = slugify(sanitizedOrgName) || 'org';
  const slug = `${baseSlug}-${user.id.slice(0, 8)}`;

  const { data: org, error: orgError } = await db
    .from('kefy_organizations')
    .insert({ name: sanitizedOrgName, slug, plan: 'starter' })
    .select('id')
    .single();

  if (orgError || !org) {
    console.error('Org creation error:', orgError?.message);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }

  // Create membership (owner)
  await db.from('kefy_org_memberships').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  });

  // Create starter subscription
  await db.from('kefy_subscriptions').insert({
    org_id: org.id,
    plan: 'starter',
    status: 'active',
  });

  // Issue tokens
  const accessToken = await signAccessToken({
    userId: user.id,
    orgId: org.id,
    role: 'owner',
    plan: 'starter',
  });

  const { raw: refreshRaw, hash: refreshHash, expiresAt } = generateRefreshToken();

  await db.from('kefy_refresh_tokens').insert({
    user_id: user.id,
    token_hash: refreshHash,
    expires_at: expiresAt.toISOString(),
  });

  const res = NextResponse.json(
    { user: { id: user.id, email: sanitizedEmail, name: sanitizedName }, orgId: org.id },
    { status: 201 }
  );
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshRaw, refreshCookieOptions());
  return res;
}
