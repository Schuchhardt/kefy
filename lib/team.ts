// ─── Miembros de la organización ─────────────────────────────────────────────
//
// La página de precios anuncia un número de miembros por plan. Hasta ahora no
// existía forma de invitar a nadie: `kefy_org_memberships` solo se poblaba con
// el dueño al registrarse, así que el límite anunciado no se cumplía ni se
// podía alcanzar.
//
// Los roles son los que ya definía el JWT:
//   owner  — quien creó la organización. No se invita ni se puede eliminar.
//   admin  — puede invitar y gestionar miembros.
//   member — usa el producto, no gestiona el equipo.

import { randomBytes } from 'crypto';
import { hashToken } from '@/lib/auth';

/**
 * Miembros incluidos por plan, contando al dueño.
 *
 * Son los que anuncia la tabla comparativa de la landing (locales es/en). Si
 * cambian aquí, hay que cambiarlos allí — `tests/unit/lib/team.test.ts` lo
 * verifica contra la copy.
 */
export const MEMBER_LIMITS: Record<string, number> = {
  starter:  1,
  pro:      1,
  business: 5,
};

/** Duración de una invitación antes de caducar. */
export const INVITATION_TTL_DAYS = 7;

export type OrgRole = 'owner' | 'admin' | 'member';
export type InvitableRole = Exclude<OrgRole, 'owner'>;

export function memberLimitFor(plan: string): number {
  // Ante un plan desconocido se aplica el tramo más bajo.
  return MEMBER_LIMITS[plan] ?? MEMBER_LIMITS.starter;
}

/** Solo el dueño y los administradores gestionan el equipo. */
export function canManageTeam(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export interface NewInvitation {
  /** Va en el enlace del correo. No se guarda en la base. */
  raw: string;
  /** Lo que sí se guarda. */
  hash: string;
  expiresAt: Date;
}

/**
 * Genera el token de una invitación.
 *
 * Se guarda hasheado, igual que los de recuperación de contraseña: quien lea la
 * base no puede usar las invitaciones pendientes.
 */
export function generateInvitationToken(now = new Date()): NewInvitation {
  const raw = randomBytes(32).toString('hex');
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Decide si se puede añadir a alguien más.
 *
 * Las invitaciones pendientes cuentan contra el tope: si no, se podrían emitir
 * cien invitaciones con un plan de un solo miembro y el límite se saltaría en
 * cuanto las aceptasen.
 */
export function hasRoomForMember(opts: {
  plan: string;
  currentMembers: number;
  pendingInvitations: number;
}): { allowed: boolean; limit: number; used: number } {
  const limit = memberLimitFor(opts.plan);
  const used = opts.currentMembers + opts.pendingInvitations;
  return { allowed: used < limit, limit, used };
}
