import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import { checkRateLimit, clientIp, registerRule, rateLimitResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import { trialEndsAt, TRIAL_DAYS } from '@/lib/subscription';
import {
  signAccessToken,
  generateRefreshToken,
  accessCookieOptions,
  refreshCookieOptions,
  activeBrandCookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACTIVE_BRAND_COOKIE,
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
  // Beta abierta: sin este freno, un script puede crear cuentas sin fin y cada
  // una arrastra su cuota de generación con IA.
  const limit = await checkRateLimit(registerRule(clientIp(req)));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiadas cuentas creadas desde esta conexión. Intenta más tarde.');
  }

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

  // El alta toca cinco tablas y Supabase no expone transacciones desde el
  // cliente REST. Si un paso intermedio falla y se deja lo ya creado, queda una
  // cuenta a medias: el usuario existe, puede autenticarse, pero el login
  // responde 500 «No organization found» para siempre y ni siquiera puede
  // volver a registrarse porque su email ya figura como tomado.
  // Por eso cada fallo deshace lo anterior en orden inverso.
  const rollback: Array<() => Promise<void>> = [];

  async function undoAll(): Promise<void> {
    for (const step of [...rollback].reverse()) {
      try {
        await step();
      } catch (err) {
        // Si la limpieza falla queda un registro huérfano, pero el usuario ya
        // recibe su error: solo hay que dejar constancia para poder repararlo.
        reportError(err, {
          route: 'POST /api/auth/register',
          extra: { fase: 'rollback', email: sanitizedEmail },
        });
      }
    }
  }

  async function fail(step: string, error: { message?: string } | null, message: string) {
    // Los errores de Supabase son objetos planos, no instancias de Error: sin
    // envolverlos, tanto el log como Sentry reciben «[object Object]».
    reportError(new Error(error?.message ?? message), {
      route: 'POST /api/auth/register',
      extra: { fase: step },
    });
    await undoAll();
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Create user
  const { data: user, error: userError } = await db
    .from('kefy_users')
    .insert({ email: sanitizedEmail, password_hash: passwordHash, name: sanitizedName })
    .select('id')
    .single();

  if (userError || !user) {
    return fail('crear usuario', userError, 'Failed to create account');
  }
  rollback.push(async () => { await db.from('kefy_users').delete().eq('id', user.id); });

  // Create org with unique slug
  const baseSlug = slugify(sanitizedOrgName) || 'org';
  const slug = `${baseSlug}-${user.id.slice(0, 8)}`;

  const { data: org, error: orgError } = await db
    .from('kefy_organizations')
    .insert({ name: sanitizedOrgName, slug, plan: 'starter' })
    .select('id')
    .single();

  if (orgError || !org) {
    return fail('crear organización', orgError, 'Failed to create organization');
  }
  rollback.push(async () => { await db.from('kefy_organizations').delete().eq('id', org.id); });

  // Create initial brand for the new org so brand-scoped flows work immediately
  const { data: brand, error: brandError } = await db
    .from('kefy_brands')
    .insert({ org_id: org.id, name: sanitizedOrgName, slug })
    .select('id')
    .single();

  if (brandError || !brand) {
    return fail('crear marca', brandError, 'Failed to initialize brand');
  }
  rollback.push(async () => { await db.from('kefy_brands').delete().eq('id', brand.id); });

  // Create membership (owner).
  // Sin membresía el login no encuentra organización, así que su fallo es tan
  // terminal como el de los pasos anteriores y hay que tratarlo igual.
  const { error: membershipError } = await db.from('kefy_org_memberships').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  });

  if (membershipError) {
    return fail('crear membresía', membershipError, 'Failed to create account');
  }
  rollback.push(async () => {
    await db.from('kefy_org_memberships').delete().eq('org_id', org.id).eq('user_id', user.id);
  });

  // Suscripción en prueba: Starter gratis el primer mes.
  // `current_period_end` marca el fin del mes gratis; a partir de ahí la cuenta
  // deja de poder generar, pero conserva todo lo que creó (ver lib/subscription).
  //
  // Su fallo sí es terminal: sin fila de suscripción la cuenta no puede crear
  // nada desde el primer día, que es peor que no haberla creado.
  const { error: subscriptionError } = await db.from('kefy_subscriptions').insert({
    org_id: org.id,
    plan: 'starter',
    status: 'trialing',
    current_period_start: new Date().toISOString(),
    current_period_end: trialEndsAt().toISOString(),
  });

  if (subscriptionError) {
    return fail('crear suscripción', subscriptionError, 'Failed to create account');
  }
  rollback.push(async () => {
    await db.from('kefy_subscriptions').delete().eq('org_id', org.id);
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
    {
      user: { id: user.id, email: sanitizedEmail, name: sanitizedName },
      orgId: org.id,
      trial: { days: TRIAL_DAYS, endsAt: trialEndsAt().toISOString() },
    },
    { status: 201 }
  );
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshRaw, refreshCookieOptions());
  res.cookies.set(ACTIVE_BRAND_COOKIE, brand.id, activeBrandCookieOptions());
  return res;
}
