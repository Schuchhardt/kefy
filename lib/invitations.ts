// ─── Invitaciones al equipo: carga y validación por token ────────────────────
//
// La usan POST/GET /api/team/invitations/accept y el registro con invitación
// (POST /api/auth/register con `invitationToken`). Antes, registrarse desde
// una invitación creaba una organización nueva con su trial y la persona
// aterrizaba en una cuenta vacía en vez de en el equipo que la invitó.

import { createSupabaseServer } from '@/lib/supabase';
import { hashToken } from '@/lib/auth';

export interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  role: 'admin' | 'member';
  expires_at: string;
  accepted_at: string | null;
  orgName: string | null;
  /** Plan de la organización, para firmar el JWT de quien se registra. */
  orgPlan: string | null;
}

export type InvitationProblem = 'invitation_not_found' | 'invitation_accepted' | 'invitation_expired';

/** Invitación del token, o null si no existe. */
export async function loadInvitationByToken(token: string): Promise<InvitationRow | null> {
  const db = createSupabaseServer();
  const { data } = await db
    .from('kefy_org_invitations')
    .select('id, org_id, email, role, expires_at, accepted_at, kefy_organizations(name, plan)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data) return null;
  const org = (data as { kefy_organizations?: unknown }).kefy_organizations as
    { name: string; plan: string | null } | null;
  return {
    id: data.id,
    org_id: data.org_id,
    email: data.email,
    role: data.role,
    expires_at: data.expires_at,
    accepted_at: data.accepted_at,
    orgName: org?.name ?? null,
    orgPlan: org?.plan ?? null,
  };
}

/** Por qué no se puede usar una invitación (o null si se puede). */
export function invitationProblem(inv: InvitationRow | null, now = new Date()): InvitationProblem | null {
  if (!inv) return 'invitation_not_found';
  if (inv.accepted_at) return 'invitation_accepted';
  if (new Date(inv.expires_at) <= now) return 'invitation_expired';
  return null;
}

/** Mensaje y estado HTTP de cada problema (el `code` lo traduce la UI). */
export const INVITATION_ERRORS: Record<InvitationProblem, { status: number; error: string }> = {
  invitation_not_found: { status: 404, error: 'La invitación no existe o ya fue usada' },
  invitation_accepted: { status: 409, error: 'Esta invitación ya fue aceptada' },
  invitation_expired: { status: 410, error: 'La invitación expiró. Pide una nueva.' },
};
