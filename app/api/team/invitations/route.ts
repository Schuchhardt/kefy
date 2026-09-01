import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { appUrl } from '@/lib/app-url';
import { reportError } from '@/lib/observability';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  canManageTeam, generateInvitationToken, hasRoomForMember,
  isValidEmail, normalizeEmail, memberLimitFor, type InvitableRole,
} from '@/lib/team';
import TeamInvitation from '@/emails/TeamInvitation';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Kefy <no-reply@email.kefy.app>';

// ─── GET /api/team/invitations ───────────────────────────────────────────────
// Invitaciones pendientes de la organización.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_org_invitations')
    .select('id, email, role, expires_at, created_at')
    .eq('org_id', auth.orgId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    reportError(new Error(error.message), {
      route: 'GET /api/team/invitations', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 });
  }

  const now = Date.now();
  return NextResponse.json({
    invitations: (data ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expires_at,
      // Una invitación caducada sigue en la tabla hasta que se revoque o se
      // reemplace; la UI necesita distinguirla de una que aún sirve.
      expired: new Date(i.expires_at).getTime() <= now,
    })),
  });
}

// ─── POST /api/team/invitations ──────────────────────────────────────────────
// Invita a alguien a la organización y le envía el correo.
//
// Body: { email: string, role?: 'admin' | 'member', lang?: 'es' | 'en' }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Solo el dueño o un administrador pueden invitar' }, { status: 403 });
  }

  // Cada invitación dispara un correo: sin freno, el endpoint sirve para
  // inundar bandejas ajenas usando nuestro dominio.
  const limite = await checkRateLimit({
    bucket: `invite:org:${auth.orgId}`, limit: 20, windowSeconds: 3600,
  });
  if (!limite.allowed) {
    return rateLimitResponse(limite, 'Demasiadas invitaciones en poco tiempo. Intenta más tarde.');
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.email !== 'string' || !isValidEmail(input.email)) {
    return NextResponse.json({ error: 'Ingresa un email válido' }, { status: 422 });
  }
  const email = normalizeEmail(input.email);

  const role: InvitableRole = input.role === 'admin' ? 'admin' : 'member';
  const lang: 'es' | 'en' = input.lang === 'en' ? 'en' : 'es';

  const db = createSupabaseServer();

  // ── Cupo del plan ──────────────────────────────────────────────────────────
  const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
    db.from('kefy_org_memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    db.from('kefy_org_invitations').select('id', { count: 'exact', head: true })
      .eq('org_id', auth.orgId).is('accepted_at', null),
  ]);

  const cupo = hasRoomForMember({
    plan: auth.plan,
    currentMembers: memberCount ?? 0,
    pendingInvitations: pendingCount ?? 0,
  });

  if (!cupo.allowed) {
    return NextResponse.json(
      {
        error: `Tu plan incluye ${cupo.limit} ${cupo.limit === 1 ? 'miembro' : 'miembros'}. Mejora tu plan para invitar a más personas.`,
        planLimitReached: true,
        limit: cupo.limit,
        used: cupo.used,
      },
      { status: 403 },
    );
  }

  // ── Ya es miembro ──────────────────────────────────────────────────────────
  const { data: existingUser } = await db
    .from('kefy_users').select('id').eq('email', email).maybeSingle();

  if (existingUser) {
    const { data: yaMiembro } = await db
      .from('kefy_org_memberships')
      .select('user_id')
      .eq('org_id', auth.orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle();

    if (yaMiembro) {
      return NextResponse.json({ error: 'Esa persona ya es parte de tu equipo' }, { status: 409 });
    }
  }

  // ── Crear la invitación ────────────────────────────────────────────────────
  // Reinvitar sustituye la pendiente en vez de acumular tokens válidos para la
  // misma persona (hay un índice único parcial que lo garantiza en la base).
  await db.from('kefy_org_invitations')
    .delete().eq('org_id', auth.orgId).eq('email', email).is('accepted_at', null);

  const { raw, hash, expiresAt } = generateInvitationToken();

  const { data: invitation, error: insertError } = await db
    .from('kefy_org_invitations')
    .insert({
      org_id: auth.orgId,
      email,
      role,
      token_hash: hash,
      invited_by: auth.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, email, role, expires_at')
    .single();

  if (insertError || !invitation) {
    reportError(new Error(insertError?.message ?? 'insert failed'), {
      route: 'POST /api/team/invitations', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'No se pudo crear la invitación' }, { status: 500 });
  }

  // ── Enviar el correo ───────────────────────────────────────────────────────
  const { data: org } = await db
    .from('kefy_organizations').select('name').eq('id', auth.orgId).maybeSingle();
  const { data: quienInvita } = await db
    .from('kefy_users').select('name').eq('id', auth.userId).maybeSingle();

  let emailSent = false;
  if (resendApiKey) {
    try {
      const inviteUrl = `${appUrl()}/${lang}/invitacion?token=${raw}`;
      const html = await render(
        TeamInvitation({
          orgName: org?.name ?? 'Kefy',
          inviterName: quienInvita?.name ?? null,
          inviteUrl,
          lang,
        }),
      );
      const subject = lang === 'en'
        ? `You've been invited to join ${org?.name ?? 'Kefy'} on Kefy`
        : `Te invitaron a ${org?.name ?? 'Kefy'} en Kefy`;

      await new Resend(resendApiKey).emails.send({ from: fromEmail, to: email, subject, html });
      emailSent = true;
    } catch (err) {
      // La invitación ya existe y es válida: el fallo del correo no la anula,
      // pero hay que saberlo para poder reenviarla.
      reportError(err, { route: 'POST /api/team/invitations', auth, service: 'resend' });
    }
  }

  return NextResponse.json(
    {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
      },
      emailSent,
      limit: memberLimitFor(auth.plan),
    },
    { status: 201 },
  );
}
