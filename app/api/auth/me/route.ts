import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import {
  getAuthFromRequest, ACCESS_COOKIE, REFRESH_COOKIE, clearCookieOptions,
  generateRefreshToken, refreshCookieOptions,
} from '@/lib/auth';
import { getUsage } from '@/lib/usage';
import { getEntitlement } from '@/lib/subscription';
import { reportError } from '@/lib/observability';

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();

  const { data: user } = await db
    .from('kefy_users')
    .select('id, email, name, created_at')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: org } = await db
    .from('kefy_organizations')
    .select('id, name, slug, plan, session_invalidated_at')
    .eq('id', auth.orgId)
    .maybeSingle();

  // Sesiones canceladas a propósito (scripts/grant-comp-plan.ts): el access
  // token no tiene forma de invalidarse solo (es un JWT sin estado, vive hasta
  // 24h), así que este es el único punto donde se corta. Cualquier token
  // emitido antes de la marca se trata como si hubiera expirado — el cliente
  // ya sabe reaccionar a un 401 acá: intenta refrescar, el refresh token
  // también fue revocado, y termina mandando al login.
  if (org?.session_invalidated_at && auth.iat) {
    const invalidatedAt = new Date(org.session_invalidated_at).getTime() / 1000;
    if (auth.iat < invalidatedAt) {
      const res = NextResponse.json({ error: 'Session invalidated' }, { status: 401 });
      res.cookies.set(ACCESS_COOKIE, '', clearCookieOptions());
      res.cookies.set(REFRESH_COOKIE, '', clearCookieOptions('/api/auth/refresh'));
      return res;
    }
  }

  // El plan efectivo sale de la organización y no del JWT: el token puede ser
  // anterior a un cambio de plan.
  const effectivePlan = (org?.plan as string | undefined) ?? auth.plan;

  // Créditos y estado de suscripción, para que la UI avise antes de que el
  // usuario se choque con un 429 o un 402. Ambos son informativos aquí: si no
  // se pueden leer, el resto de la respuesta sigue sirviendo y la UI
  // simplemente no muestra el aviso. El bloqueo real lo hace `guardAiRequest`.
  const [usage, subscription] = await Promise.all([
    getUsage(auth.orgId, effectivePlan).catch((err) => {
      reportError(err, { route: 'GET /api/auth/me', auth, extra: { fase: 'créditos' } });
      return null;
    }),
    getEntitlement(auth.orgId).catch((err) => {
      reportError(err, { route: 'GET /api/auth/me', auth, extra: { fase: 'suscripción' } });
      return null;
    }),
  ]);

  return NextResponse.json({
    user,
    org,
    role: auth.role,
    plan: effectivePlan,
    usage,
    subscription,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const { name, org_name, current_password, new_password } = body as Record<string, unknown>;

  const db = createSupabaseServer();

  // ── Password change ──────────────────────────────────────────────────────
  if (typeof current_password === 'string' || typeof new_password === 'string') {
    if (typeof current_password !== 'string' || !current_password) {
      return NextResponse.json({ error: 'La contraseña actual es requerida' }, { status: 400 });
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, { status: 400 });
    }

    const { data: userRow } = await db
      .from('kefy_users')
      .select('password_hash')
      .eq('id', auth.userId)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const match = await bcrypt.compare(current_password, userRow.password_hash);
    if (!match) {
      return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 400 });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const { error } = await db
      .from('kefy_users')
      .update({ password_hash: newHash })
      .eq('id', auth.userId);

    if (error) {
      return NextResponse.json({ error: 'Error al actualizar contraseña' }, { status: 500 });
    }

    // Igual que al restablecerla: cambiar la contraseña cierra las demás
    // sesiones. Se borran todos los refresh tokens del usuario y se emite uno
    // nuevo para esta (la cookie de refresh no llega a esta ruta, así que no
    // se puede conservar la actual por su hash).
    const { error: revokeError } = await db
      .from('kefy_refresh_tokens')
      .delete()
      .eq('user_id', auth.userId);
    if (revokeError) {
      reportError(new Error(revokeError.message), {
        route: 'PATCH /api/auth/me', auth, service: 'supabase', extra: { op: 'revoke_refresh_tokens' },
      });
      return NextResponse.json(
        { error: 'La contraseña se cambió, pero no se pudieron cerrar las demás sesiones. Inténtalo de nuevo.' },
        { status: 500 },
      );
    }

    const res = NextResponse.json({ ok: true });
    const { raw, hash, expiresAt } = generateRefreshToken();
    const { error: insertError } = await db.from('kefy_refresh_tokens').insert({
      user_id: auth.userId,
      token_hash: hash,
      expires_at: expiresAt.toISOString(),
    });
    if (insertError) {
      // Sin refresh token esta sesión durará lo que le quede al access token;
      // la contraseña ya cambió, así que no es un fallo de la operación.
      reportError(new Error(insertError.message), {
        route: 'PATCH /api/auth/me', auth, service: 'supabase', extra: { op: 'issue_refresh_token' },
      });
    } else {
      res.cookies.set(REFRESH_COOKIE, raw, refreshCookieOptions());
    }
    return res;
  }

  // ── Name update ──────────────────────────────────────────────────────────
  if (typeof org_name === 'string') {
    if (!['owner', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!org_name.trim()) {
      return NextResponse.json({ error: 'El nombre de la organización no puede estar vacío' }, { status: 400 });
    }

    const { data: updatedOrg, error: orgError } = await db
      .from('kefy_organizations')
      .update({ name: org_name.trim().slice(0, 100) })
      .eq('id', auth.orgId)
      .select('id, name, slug, plan')
      .maybeSingle();

    if (orgError || !updatedOrg) {
      return NextResponse.json({ error: 'Error al actualizar organización' }, { status: 500 });
    }

    return NextResponse.json({ org: updatedOrg });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
  }

  const { data: updated, error } = await db
    .from('kefy_users')
    .update({ name: name.trim() })
    .eq('id', auth.userId)
    .select('id, email, name, created_at')
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 });
  }

  return NextResponse.json({ user: updated });
}

