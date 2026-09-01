import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest, hashToken } from '@/lib/auth';
import { normalizeEmail } from '@/lib/team';
import { reportError } from '@/lib/observability';
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit';

// ─── GET /api/team/invitations/accept?token=… ────────────────────────────────
// Describe una invitación sin aceptarla, para que la página pueda mostrar a qué
// organización se está entrando antes de pedir cuenta. No requiere sesión: el
// token es la credencial, y quien lo tiene lo recibió por correo.

async function loadInvitation(token: string) {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_org_invitations')
    .select('id, org_id, email, role, expires_at, accepted_at, kefy_organizations(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 });

  // El token se compara contra la base: sin freno esto permite sondearlos.
  const limite = await checkRateLimit({
    bucket: `invite-accept:ip:${clientIp(req)}`, limit: 20, windowSeconds: 3600,
  });
  if (!limite.allowed) {
    return rateLimitResponse(limite, 'Demasiados intentos. Intenta más tarde.');
  }

  const invitation = await loadInvitation(token);
  if (!invitation) {
    return NextResponse.json({ error: 'La invitación no existe o ya fue usada' }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Esta invitación ya fue aceptada' }, { status: 409 });
  }
  if (new Date(invitation.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'La invitación expiró. Pide una nueva.' }, { status: 410 });
  }

  const org = invitation.kefy_organizations as unknown as { name: string } | null;

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    orgName: org?.name ?? null,
    expiresAt: invitation.expires_at,
  });
}

// ─── POST /api/team/invitations/accept ───────────────────────────────────────
// Acepta la invitación con la sesión activa.
//
// Body: { token: string }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'Inicia sesión o crea tu cuenta para aceptar la invitación', needsAuth: true },
      { status: 401 },
    );
  }

  const limite = await checkRateLimit({
    bucket: `invite-accept:ip:${clientIp(req)}`, limit: 20, windowSeconds: 3600,
  });
  if (!limite.allowed) {
    return rateLimitResponse(limite, 'Demasiados intentos. Intenta más tarde.');
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const token = (body as Record<string, unknown>)?.token;
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
  }

  const invitation = await loadInvitation(token);
  if (!invitation) {
    return NextResponse.json({ error: 'La invitación no existe o ya fue usada' }, { status: 404 });
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Esta invitación ya fue aceptada' }, { status: 409 });
  }
  if (new Date(invitation.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'La invitación expiró. Pide una nueva.' }, { status: 410 });
  }

  const db = createSupabaseServer();

  // La invitación es para un email concreto: no se puede reutilizar el enlace
  // desde otra cuenta, aunque se tenga el token.
  const { data: user } = await db
    .from('kefy_users').select('email').eq('id', auth.userId).maybeSingle();

  if (!user || normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
    return NextResponse.json(
      { error: `Esta invitación es para ${invitation.email}. Inicia sesión con esa cuenta.`, wrongAccount: true },
      { status: 403 },
    );
  }

  const { error: membershipError } = await db.from('kefy_org_memberships').insert({
    org_id:  invitation.org_id,
    user_id: auth.userId,
    role:    invitation.role,
  });

  if (membershipError) {
    reportError(new Error(membershipError.message), {
      route: 'POST /api/team/invitations/accept', auth,
      extra: { invitationId: invitation.id },
    });
    return NextResponse.json({ error: 'No se pudo unir a la organización' }, { status: 500 });
  }

  await db
    .from('kefy_org_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: auth.userId })
    .eq('id', invitation.id);

  // El JWT actual sigue apuntando a la organización anterior. El cliente debe
  // renovarlo (/api/auth/refresh) para que la sesión refleje la membresía nueva.
  return NextResponse.json({ ok: true, orgId: invitation.org_id, refreshRequired: true });
}
