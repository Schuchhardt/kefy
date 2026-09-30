import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeRpc, resetQuotaState, resetSubscriptionState } from '../helpers/quota';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
  rpc: fakeRpc,
};

// `guardAiRequest` y `requireActiveSubscription` consultan la suscripción antes
// de gastar nada. Se controla desde `subscriptionState` (helpers/quota).
vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/subscription')>();
  const { fakeEntitlement } = await import('../helpers/quota');
  return {
    ...actual,
    getEntitlement: async () => fakeEntitlement(),
    requireActiveSubscription: async (_orgId: string, language: 'es' | 'en' = 'es') => {
      const e = fakeEntitlement();
      if (e.canCreate) return null;
      const reason = e.reason ?? 'canceled';
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        { error: actual.blockMessage(reason, language), subscriptionRequired: true, reason, status: e.status },
        { status: 402 },
      );
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  createSupabaseServer: () => mockSupabaseClient,
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpw'),
    compare: vi.fn(),
  },
  hash: vi.fn().mockResolvedValue('$2b$12$hashedpw'),
  compare: vi.fn(),
}));

import bcrypt from 'bcryptjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, url = 'http://localhost:3097/api/auth/login') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildSupabaseChain(resolveWith: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolveWith),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveWith),
  };
  return chain;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('devuelve 400 si el email es inválido', async () => {
    const { POST } = await import('@/app/api/auth/login/route');

    const res = await POST(makeRequest({ email: 'no-es-email', password: 'secret123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('devuelve 400 si la contraseña está vacía', async () => {
    const { POST } = await import('@/app/api/auth/login/route');

    const res = await POST(makeRequest({ email: 'test@example.com', password: '' }));
    expect(res.status).toBe(400);
  });

  it('devuelve 401 si el usuario no existe', async () => {
    const { POST } = await import('@/app/api/auth/login/route');

    // Supabase no encuentra usuario
    const chain = buildSupabaseChain({ data: null, error: null });
    mockSupabaseClient.from.mockReturnValue(chain);
    // bcrypt.compare devuelve false (hash dummy)
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    const res = await POST(makeRequest({ email: 'noexiste@example.com', password: 'password123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid/i);
  });

  it('devuelve 401 si la contraseña es incorrecta', async () => {
    const { POST } = await import('@/app/api/auth/login/route');

    const userChain = buildSupabaseChain({
      data: { id: 'u1', email: 'user@example.com', name: 'User', password_hash: '$2b$12$hash' },
      error: null,
    });
    mockSupabaseClient.from.mockReturnValue(userChain);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    const res = await POST(makeRequest({ email: 'user@example.com', password: 'wrongpassword' }));
    expect(res.status).toBe(401);
  });

  it('devuelve 200 con Set-Cookie en credenciales correctas', async () => {
    const { POST } = await import('@/app/api/auth/login/route');

    // Primera llamada: buscar usuario
    const userChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'u1', email: 'user@example.com', name: 'User', password_hash: '$2b$12$hash' },
        error: null,
      }),
    };
    // Segunda llamada: buscar membership
    const membershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { org_id: 'org-1', role: 'owner', kefy_organizations: { plan: 'pro' } },
        error: null,
      }),
    };
    // Tercera llamada: insertar refresh token
    const insertChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockSupabaseClient.from
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(membershipChain)
      .mockReturnValueOnce(insertChain);

    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    const res = await POST(makeRequest({ email: 'user@example.com', password: 'correctpassword' }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/kefy_access/);
  });
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('devuelve 400 si el email es inválido', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(
      { email: 'invalido', password: 'password123', name: 'Juan', orgName: 'Acme' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(400);
  });

  it('devuelve 400 si la contraseña tiene menos de 8 caracteres', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(
      { email: 'test@example.com', password: 'short', name: 'Juan', orgName: 'Acme' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/8/);
  });

  it('devuelve 400 si falta el nombre', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(
      { email: 'test@example.com', password: 'password123', name: '', orgName: 'Acme' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(400);
  });

  it('devuelve 409 si el email ya está registrado', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const existingChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1' }, error: null }),
    };
    mockSupabaseClient.from.mockReturnValue(existingChain);

    const res = await POST(makeRequest(
      { email: 'exists@example.com', password: 'password123', name: 'Juan', orgName: 'Acme' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already/i);
  });

  it('devuelve 201 con cookies en registro exitoso', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    // email check: no existe
    const noExistChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    // insert user
    const insertUserChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new-user-id' }, error: null }),
    };
    // insert org
    const insertOrgChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new-org-id' }, error: null }),
    };
    // insert initial brand
    const insertBrandChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new-brand-id' }, error: null }),
    };
    // insert membership
    const insertMembershipChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    // insert subscription
    const insertSubChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    // insert refresh token
    const insertRefreshChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockSupabaseClient.from
      .mockReturnValueOnce(noExistChain)
      .mockReturnValueOnce(insertUserChain)
      .mockReturnValueOnce(insertOrgChain)
      .mockReturnValueOnce(insertBrandChain)
      .mockReturnValueOnce(insertMembershipChain)
      .mockReturnValueOnce(insertSubChain)
      .mockReturnValueOnce(insertRefreshChain);

    vi.mocked(bcrypt.hash).mockResolvedValueOnce('$2b$12$hashed' as never);

    const res = await POST(makeRequest(
      { email: 'newuser@example.com', password: 'password123', name: 'Juan', orgName: 'Acme Corp' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(201);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/kefy_access/);
  });
});

// ─── Registro desde una invitación ────────────────────────────────────────────
// Antes el registro ignoraba la invitación: creaba organización, marca y trial
// propios y la persona no llegaba nunca al equipo que la invitó.

describe('POST /api/auth/register con invitationToken', () => {
  const futuro = new Date(Date.now() + 86_400_000).toISOString();
  const pasado = new Date(Date.now() - 86_400_000).toISOString();

  function invitacion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inv-1', org_id: 'org-equipo', email: 'Ana@Example.com', role: 'member',
      expires_at: futuro, accepted_at: null,
      kefy_organizations: { name: 'Equipo Acme', plan: 'pro' },
      ...overrides,
    };
  }

  /** `from(tabla)` según la tabla; registra lo que se inserta en cada una. */
  function mockTablas(inv: unknown) {
    const inserts: Record<string, unknown[]> = {};
    const updates: Record<string, unknown[]> = {};
    mockSupabaseClient.from.mockImplementation((tabla: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => (
        tabla === 'kefy_org_invitations' ? { data: inv, error: null } : { data: null, error: null }
      ));
      chain.single = vi.fn(async () => ({ data: { id: 'nuevo-usuario' }, error: null }));
      chain.insert = vi.fn((row: unknown) => {
        (inserts[tabla] ??= []).push(row);
        // El alta del usuario encadena .select().single(); el resto se espera directo.
        return tabla === 'kefy_users' ? chain : Promise.resolve({ error: null });
      });
      chain.update = vi.fn((row: unknown) => {
        (updates[tabla] ??= []).push(row);
        return { eq: vi.fn(async () => ({ error: null })) };
      });
      return chain;
    });
    return { inserts, updates };
  }

  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$hashed' as never);
  });

  it('une a la organización que invitó sin crear organización, marca ni suscripción', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const { inserts, updates } = mockTablas(invitacion());

    const res = await POST(makeRequest(
      { email: 'ana@example.com', password: 'password123', name: 'Ana', invitationToken: 'tok' },
      'http://localhost:3097/api/auth/register',
    ));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ orgId: 'org-equipo', joinedByInvitation: true });
    expect(inserts.kefy_org_memberships).toEqual([
      { org_id: 'org-equipo', user_id: 'nuevo-usuario', role: 'member' },
    ]);
    expect(inserts.kefy_organizations).toBeUndefined();
    expect(inserts.kefy_brands).toBeUndefined();
    expect(inserts.kefy_subscriptions).toBeUndefined();
    expect(updates.kefy_org_invitations?.[0]).toMatchObject({ accepted_by: 'nuevo-usuario' });
    expect(res.headers.get('set-cookie')).toMatch(/kefy_access/);
  });

  it('no pide nombre de negocio cuando hay invitación', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    mockTablas(invitacion());

    const res = await POST(makeRequest(
      { email: 'ana@example.com', password: 'password123', name: 'Ana', orgName: '', invitationToken: 'tok' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(201);
  });

  it('rechaza un email distinto al de la invitación', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const { inserts } = mockTablas(invitacion());

    const res = await POST(makeRequest(
      { email: 'otra@example.com', password: 'password123', name: 'Otra', invitationToken: 'tok' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('invitation_wrong_account');
    expect(inserts.kefy_users).toBeUndefined();
  });

  it.each([
    ['caducada', invitacion({ expires_at: pasado }), 410, 'invitation_expired'],
    ['ya aceptada', invitacion({ accepted_at: pasado }), 409, 'invitation_accepted'],
    ['inexistente', null, 404, 'invitation_not_found'],
  ])('responde con código si la invitación está %s', async (_caso, inv, status, code) => {
    const { POST } = await import('@/app/api/auth/register/route');
    const { inserts } = mockTablas(inv);

    const res = await POST(makeRequest(
      { email: 'ana@example.com', password: 'password123', name: 'Ana', invitationToken: 'tok' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    expect(inserts.kefy_users).toBeUndefined();
  });
});

// ─── Códigos de error estables ────────────────────────────────────────────────
// La UI traduce el `code` (lib/auth-errors.ts); el texto se mantiene.

describe('códigos de error de auth', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('login incorrecto devuelve invalid_credentials', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    mockSupabaseClient.from.mockReturnValue(buildSupabaseChain({ data: null, error: null }));
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await POST(makeRequest({ email: 'a@b.co', password: 'x' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Invalid email or password', code: 'invalid_credentials' });
  });

  it('registro con email tomado devuelve email_taken', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    mockSupabaseClient.from.mockReturnValue(buildSupabaseChain({ data: { id: 'u1' }, error: null }));

    const res = await POST(makeRequest(
      { email: 'a@b.co', password: 'password123', name: 'A', orgName: 'B' },
      'http://localhost:3097/api/auth/register',
    ));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('email_taken');
  });
});

// ─── GET /api/auth/reset-password ─────────────────────────────────────────────
// La página comprueba el enlace antes de pedir la contraseña nueva.

describe('GET /api/auth/reset-password', () => {
  beforeEach(() => {
    resetQuotaState(); resetSubscriptionState();
    vi.resetAllMocks();
  });

  function getReq(token?: string) {
    const url = new URL('http://localhost:3097/api/auth/reset-password');
    if (token) url.searchParams.set('token', token);
    return new NextRequest(url, { method: 'GET' });
  }

  it('sin token devuelve token_required', async () => {
    const { GET } = await import('@/app/api/auth/reset-password/route');
    const res = await GET(getReq());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('token_required');
  });

  it('un token desconocido devuelve reset_invalid', async () => {
    const { GET } = await import('@/app/api/auth/reset-password/route');
    mockSupabaseClient.from.mockReturnValue(buildSupabaseChain({ data: null, error: null }));
    const res = await GET(getReq('nope'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('reset_invalid');
  });

  it('un token caducado devuelve reset_expired', async () => {
    const { GET } = await import('@/app/api/auth/reset-password/route');
    mockSupabaseClient.from.mockReturnValue(buildSupabaseChain({
      data: { id: 't1', user_id: 'u1', expires_at: new Date(Date.now() - 1000).toISOString() },
      error: null,
    }));
    const res = await GET(getReq('viejo'));
    expect((await res.json()).code).toBe('reset_expired');
  });

  it('un token vigente es válido', async () => {
    const { GET } = await import('@/app/api/auth/reset-password/route');
    mockSupabaseClient.from.mockReturnValue(buildSupabaseChain({
      data: { id: 't1', user_id: 'u1', expires_at: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    }));
    const res = await GET(getReq('bueno'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
  });
});
