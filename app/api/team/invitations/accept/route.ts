import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { normalizeEmail } from '@/lib/team';
import { reportError } from '@/lib/observability';
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit';
import { INVITATION_ERRORS, invitationProblem, loadInvitationByToken } from '@/lib/invitations';

// Las respuestas de error llevan `code` (ver lib/auth-errors.ts): la página
// de invitación las traduce en vez de mostrar el texto del API tal cual.

// ─── GET /api/team/invitations/accept?token=… ────────────────────────────────
// Describe una invitación sin aceptarla, para que la página pueda mostrar a qué
// organización se está entrando antes de pedir cuenta. No requiere sesión: el
// token es la credencial, y quien lo tiene lo recibió por correo.

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token requerido', code: 'token_required' }, { status: 400 });

  // El token se compara contra la base: sin freno esto permite sondearlos.
  const limite = await checkRateLimit({
    bucket: `invite-accept:ip:${clientIp(req)}`, limit: 20, windowSeconds: 3600,
  });
  if (!limite.allowed) {
    return rateLimitResponse(limite, 'Demasiados intentos. Intenta más tarde.');
  }

  const invitation = await loadInvitationByToken(token);
  const problem = invitationProblem(invitation);
  if (problem || !invitation) {
    const { status, error } = INVITATION_ERRORS[problem ?? 'invitation_not_found'];
    return NextResponse.json({ error, code: problem }, { status });
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    orgName: invitation.orgName,
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
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }
  const token = (body as Record<string, unknown>)?.token;
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Token requerido', code: 'token_required' }, { status: 400 });
  }

  const invitation = await loadInvitationByToken(token);
  const problem = invitationProblem(invitation);
  if (problem || !invitation) {
    const { status, error } = INVITATION_ERRORS[problem ?? 'invitation_not_found'];
    return NextResponse.json({ error, code: problem }, { status });
  }

  const db = createSupabaseServer();

  // La invitación es para un email concreto: no se puede reutilizar el enlace
  // desde otra cuenta, aunque se tenga el token.
  const { data: user } = await db
    .from('kefy_users').select('email').eq('id', auth.userId).maybeSingle();

  if (!user || normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
    return NextResponse.json(
      {
        error: `Esta invitación es para ${invitation.email}. Inicia sesión con esa cuenta.`,
        code: 'invitation_wrong_account',
        wrongAccount: true,
      },
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
    return NextResponse.json({ error: 'No se pudo unir a la organización', code: 'generic' }, { status: 500 });
  }

  await db
    .from('kefy_org_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: auth.userId })
    .eq('id', invitation.id);

  // El JWT actual sigue apuntando a la organización anterior. El cliente debe
  // renovarlo (/api/auth/refresh) para que la sesión refleje la membresía nueva.
  return NextResponse.json({ ok: true, orgId: invitation.org_id, refreshRequired: true });
}
