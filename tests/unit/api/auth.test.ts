import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
};

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
