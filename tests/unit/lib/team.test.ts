import { describe, it, expect } from 'vitest';
import {
  MEMBER_LIMITS, memberLimitFor, canManageTeam, hasRoomForMember,
  generateInvitationToken, isValidEmail, normalizeEmail, INVITATION_TTL_DAYS,
} from '@/lib/team';
import { hashToken } from '@/lib/auth';
import es from '@/locales/es/landing';
import en from '@/locales/en/landing';

describe('MEMBER_LIMITS', () => {
  // La tabla comparativa de la landing anuncia estos números. Si dejan de
  // coincidir, la página vuelve a prometer algo que el producto no cumple —
  // que es justo el problema que este módulo vino a resolver.
  it('coincide con lo que anuncia la tabla comparativa, en ambos idiomas', () => {
    for (const [idioma, copy] of [['es', es], ['en', en]] as const) {
      const fila = copy.pricing.cmpRows.find((r) => /miembros|team members/i.test(r.feature));
      expect(fila, `[${idioma}] falta la fila de miembros en la tabla`).toBeDefined();
      expect(fila!.values).toEqual([
        String(MEMBER_LIMITS.starter),
        String(MEMBER_LIMITS.pro),
        String(MEMBER_LIMITS.business),
      ]);
    }
  });

  it('el plan más caro no incluye menos miembros que el más barato', () => {
    expect(MEMBER_LIMITS.business).toBeGreaterThanOrEqual(MEMBER_LIMITS.pro);
    expect(MEMBER_LIMITS.pro).toBeGreaterThanOrEqual(MEMBER_LIMITS.starter);
  });
});

describe('memberLimitFor', () => {
  it('devuelve el tope del plan', () => {
    expect(memberLimitFor('business')).toBe(MEMBER_LIMITS.business);
  });

  it('un plan desconocido cae en el tramo más bajo', () => {
    expect(memberLimitFor('inventado')).toBe(MEMBER_LIMITS.starter);
  });
});

describe('canManageTeam', () => {
  it('el dueño y los administradores gestionan el equipo', () => {
    expect(canManageTeam('owner')).toBe(true);
    expect(canManageTeam('admin')).toBe(true);
  });

  it('un miembro normal no', () => {
    expect(canManageTeam('member')).toBe(false);
    expect(canManageTeam('')).toBe(false);
  });
});

describe('hasRoomForMember', () => {
  it('permite mientras quede cupo', () => {
    const r = hasRoomForMember({ plan: 'business', currentMembers: 2, pendingInvitations: 1 });
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(3);
    expect(r.limit).toBe(MEMBER_LIMITS.business);
  });

  it('bloquea justo al alcanzar el tope', () => {
    const r = hasRoomForMember({
      plan: 'business',
      currentMembers: MEMBER_LIMITS.business,
      pendingInvitations: 0,
    });
    expect(r.allowed).toBe(false);
  });

  // Sin contar las pendientes, se podrían emitir cien invitaciones con un plan
  // de un solo miembro y el límite se saltaría en cuanto las aceptasen.
  it('las invitaciones pendientes ocupan cupo', () => {
    const r = hasRoomForMember({ plan: 'starter', currentMembers: 0, pendingInvitations: 1 });
    expect(r.allowed).toBe(false);
    expect(r.used).toBe(1);
  });

  it('un plan de un solo miembro no admite invitados', () => {
    const r = hasRoomForMember({ plan: 'starter', currentMembers: 1, pendingInvitations: 0 });
    expect(r.allowed).toBe(false);
  });
});

describe('generateInvitationToken', () => {
  it('guarda el hash y no el token en claro', () => {
    const { raw, hash } = generateInvitationToken();
    expect(hash).not.toBe(raw);
    expect(hash).toBe(hashToken(raw));
  });

  it('cada invitación tiene un token distinto', () => {
    expect(generateInvitationToken().raw).not.toBe(generateInvitationToken().raw);
  });

  it('caduca a los INVITATION_TTL_DAYS días', () => {
    const ahora = new Date('2026-09-01T00:00:00Z');
    const { expiresAt } = generateInvitationToken(ahora);
    const dias = (expiresAt.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(INVITATION_TTL_DAYS);
  });

  it('el token tiene entropía suficiente', () => {
    // 32 bytes en hexadecimal.
    expect(generateInvitationToken().raw).toHaveLength(64);
  });
});

describe('normalizeEmail', () => {
  it('normaliza mayúsculas y espacios para que no se dupliquen invitaciones', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });
});

describe('isValidEmail', () => {
  it('acepta emails válidos', () => {
    expect(isValidEmail('ana@example.com')).toBe(true);
  });

  it('rechaza los inválidos', () => {
    for (const e of ['sin-arroba', 'a@b', '@example.com', 'a b@example.com']) {
      expect(isValidEmail(e), e).toBe(false);
    }
  });
});
