import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeRpc, resetQuotaState, quotaState } from '../helpers/quota';

const mockSupabaseClient = { from: vi.fn(), rpc: fakeRpc };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

// El envío del correo no se ejercita aquí: la invitación vale aunque falle.
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn().mockResolvedValue({}) }; },
}));
vi.mock('@react-email/render', () => ({ render: vi.fn().mockResolvedValue('<html></html>') }));

import { getAuthFromRequest } from '@/lib/auth';
import { MEMBER_LIMITS } from '@/lib/team';

const owner  = { userId: 'u-owner', orgId: 'org-1', role: 'owner',  plan: 'business' };
const admin  = { userId: 'u-admin', orgId: 'org-1', role: 'admin',  plan: 'business' };
const member = { userId: 'u-member', orgId: 'org-1', role: 'member', plan: 'business' };

function postReq(body: unknown) {
  return new NextRequest('http://localhost:3099/api/team/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Simula las consultas del handler de invitación.
 * `members` y `pending` alimentan el cálculo de cupo; `existingUserId` simula
 * que el invitado ya tiene cuenta.
 */
function setupInvite(opts: {
  members?: number;
  pending?: number;
  existingUserId?: string | null;
  alreadyMember?: boolean;
  insertFails?: boolean;
}) {
  const { members = 1, pending = 0, existingUserId = null, alreadyMember = false } = opts;

  mockSupabaseClient.from.mockImplementation((table: string) => {
    // El builder de Supabase es encadenable y a la vez `await`-able: una
    // consulta de conteo se cierra con `.select(..., {head:true}).eq(...)`, sin
    // `.single()` al final. El mock lo reproduce con un `then`.
    let count: number | null = null;

    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'is', 'delete', 'order', 'update', 'insert']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.select = vi.fn((_cols: string, o?: { head?: boolean }) => {
      if (o?.head) {
        count = table === 'kefy_org_memberships' ? members : pending;
      }
      return chain;
    });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(count === null ? { data: [], error: null } : { count }).then(resolve);

    if (table === 'kefy_org_memberships') {
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: alreadyMember ? { user_id: existingUserId } : null,
      });
      chain.insert = vi.fn().mockResolvedValue({ error: null });
    } else if (table === 'kefy_org_invitations') {
      chain.single = vi.fn().mockResolvedValue(
        opts.insertFails
          ? { data: null, error: { message: 'insert failed' } }
          : { data: { id: 'inv-1', email: 'nuevo@example.com', role: 'member', expires_at: '2026-09-08T00:00:00Z' }, error: null },
      );
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null });
    } else if (table === 'kefy_users') {
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: existingUserId ? { id: existingUserId, name: 'Ana' } : null,
      });
    } else if (table === 'kefy_organizations') {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: { name: 'Acme' } });
    }

    return chain;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetQuotaState();
});

// ─── Permisos ─────────────────────────────────────────────────────────────────

describe('POST /api/team/invitations — permisos', () => {
  it('devuelve 401 sin sesión', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    const { POST } = await import('@/app/api/team/invitations/route');

    expect((await POST(postReq({ email: 'a@b.com' }))).status).toBe(401);
  });

  it('un miembro normal no puede invitar', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(member as never);
    const { POST } = await import('@/app/api/team/invitations/route');

    const res = await POST(postReq({ email: 'a@b.com' }));
    expect(res.status).toBe(403);
  });

  it('un administrador sí puede invitar', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(admin as never);
    setupInvite({ members: 1, pending: 0 });
    const { POST } = await import('@/app/api/team/invitations/route');

    expect((await POST(postReq({ email: 'nuevo@example.com' }))).status).toBe(201);
  });
});

// ─── Validación y cupo ────────────────────────────────────────────────────────

describe('POST /api/team/invitations — validación', () => {
  beforeEach(() => { vi.mocked(getAuthFromRequest).mockResolvedValue(owner as never); });

  it('rechaza un email inválido', async () => {
    setupInvite({});
    const { POST } = await import('@/app/api/team/invitations/route');

    expect((await POST(postReq({ email: 'no-es-email' }))).status).toBe(422);
  });

  it('bloquea al alcanzar el tope del plan', async () => {
    setupInvite({ members: MEMBER_LIMITS.business, pending: 0 });
    const { POST } = await import('@/app/api/team/invitations/route');

    const res = await POST(postReq({ email: 'nuevo@example.com' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.planLimitReached).toBe(true);
    expect(body.limit).toBe(MEMBER_LIMITS.business);
  });

  // Sin contar las pendientes, el tope se saltaría en cuanto las aceptasen.
  it('las invitaciones pendientes cuentan contra el tope', async () => {
    setupInvite({ members: 1, pending: MEMBER_LIMITS.business - 1 });
    const { POST } = await import('@/app/api/team/invitations/route');

    const res = await POST(postReq({ email: 'nuevo@example.com' }));
    expect(res.status).toBe(403);
    expect((await res.json()).planLimitReached).toBe(true);
  });

  it('rechaza a quien ya es parte del equipo', async () => {
    setupInvite({ existingUserId: 'u-existente', alreadyMember: true });
    const { POST } = await import('@/app/api/team/invitations/route');

    expect((await POST(postReq({ email: 'ya@example.com' }))).status).toBe(409);
  });

  // Cada invitación envía un correo con nuestro dominio: sin freno, sirve para
  // inundar bandejas ajenas.
  it('responde 429 al superar el rate limit', async () => {
    quotaState.rateLimited = true;
    setupInvite({});
    const { POST } = await import('@/app/api/team/invitations/route');

    expect((await POST(postReq({ email: 'nuevo@example.com' }))).status).toBe(429);
  });

  it('el rol por defecto es member, no admin', async () => {
    setupInvite({});
    const { POST } = await import('@/app/api/team/invitations/route');

    const res = await POST(postReq({ email: 'nuevo@example.com', role: 'cualquier-cosa' }));
    expect(res.status).toBe(201);
    expect((await res.json()).invitation.role).toBe('member');
  });
});

// ─── Eliminar miembros ────────────────────────────────────────────────────────

function deleteReq() {
  return new NextRequest('http://localhost:3099/api/team/members/x', { method: 'DELETE' });
}

function setupMember(role: string | null) {
  mockSupabaseClient.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'delete']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role } : null });
    // El delete final resuelve al encadenar el segundo .eq()
    let eqCalls = 0;
    chain.eq = vi.fn(() => {
      eqCalls += 1;
      return eqCalls >= 3 ? Promise.resolve({ error: null }) : chain;
    });
    return chain;
  });
}

describe('DELETE /api/team/members/[userId]', () => {
  it('un miembro normal no puede eliminar a nadie', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(member as never);
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: 'u-otro' }) });
    expect(res.status).toBe(403);
  });

  // Quitarse a uno mismo es un accidente, y si es el dueño deja la
  // organización sin quien la gestione.
  it('nadie puede eliminarse a sí mismo', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(owner as never);
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: owner.userId }) });
    expect(res.status).toBe(422);
  });

  it('el dueño no se puede eliminar', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(admin as never);
    setupMember('owner');
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: 'u-owner' }) });
    expect(res.status).toBe(422);
  });

  it('un administrador no puede eliminar a otro administrador', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(admin as never);
    setupMember('admin');
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: 'u-otro-admin' }) });
    expect(res.status).toBe(403);
  });

  it('el dueño sí puede eliminar a un administrador', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(owner as never);
    setupMember('admin');
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: 'u-admin' }) });
    expect(res.status).toBe(200);
  });

  it('devuelve 404 si esa persona no es del equipo', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(owner as never);
    setupMember(null);
    const { DELETE } = await import('@/app/api/team/members/[userId]/route');

    const res = await DELETE(deleteReq(), { params: Promise.resolve({ userId: 'u-ajeno' }) });
    expect(res.status).toBe(404);
  });
});
