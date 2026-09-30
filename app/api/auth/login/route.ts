import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import type { JWTPayload } from '@/types/auth';
import { checkRateLimit, clientIp, loginRule, rateLimitResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
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

// Cada error lleva un `code` estable que la página traduce con
// locales/*/auth.ts (ver lib/auth-errors.ts). El `error` se mantiene para los
// clientes del API y los logs.

export async function POST(req: NextRequest) {
  // Antes de tocar la base de datos: la fuerza bruta no debe costarnos consultas
  // ni comparaciones de bcrypt, que son deliberadamente lentas.
  const limit = await checkRateLimit(loginRule(clientIp(req)));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiados intentos de inicio de sesión. Espera unos minutos.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email is required', code: 'invalid_email' }, { status: 400 });
  }
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Password is required', code: 'password_required' }, { status: 400 });
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
    return NextResponse.json({ error: 'Invalid email or password', code: 'invalid_credentials' }, { status: 401 });
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
    // Cuenta a medias (el registro deshace sus pasos, pero hay cuentas antiguas):
    // la persona no puede entrar y hay que repararla a mano.
    reportError(new Error('Usuario sin organización'), {
      route: 'POST /api/auth/login',
      extra: { userId: user.id },
    });
    return NextResponse.json({ error: 'No organization found', code: 'no_organization' }, { status: 500 });
  }

  const org = membership.kefy_organizations as unknown as { plan: string } | null;
  const plan = (org?.plan ?? 'starter') as JWTPayload['plan'];
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
