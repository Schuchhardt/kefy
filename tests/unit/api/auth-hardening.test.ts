import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeRpc, resetQuotaState, quotaState, resetSubscriptionState } from '../helpers/quota';

// Cubre lo que la beta abierta añadió a autenticación: rate limiting por IP y
// registro transaccional (sin cuentas a medias).

const mockSupabaseClient = { from: vi.fn(), rpc: fakeRpc };
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

vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2b$12$hash'), compare: vi.fn() },
  hash: vi.fn().mockResolvedValue('$2b$12$hash'),
  compare: vi.fn(),
}));

import bcrypt from 'bcryptjs';
import { TRIAL_DAYS } from '@/lib/subscription';

function makeRequest(body: unknown, path: string, ip = '1.2.3.4') {
  return new NextRequest(`http://localhost:3099${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const validRegistration = {
  email: 'nuevo@example.com',
  password: 'password123',
  name: 'Juan',
  orgName: 'Acme',
};

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe('rate limiting en autenticación', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetQuotaState(); resetSubscriptionState();
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$hash' as never);
  });

  it('login responde 429 al superar el tope de la IP', async () => {
    quotaState.rateLimited = true;
    const { POST } = await import('@/app/api/auth/login/route');

    const res = await POST(makeRequest(
      { email: 'user@example.com', password: 'password123' },
      '/api/auth/login',
    ));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  // El freno tiene que actuar antes de bcrypt: comparar hashes es caro a
  // propósito, y es justo lo que un ataque de fuerza bruta quiere provocar.
  it('login bloqueado no llega a consultar la base ni a comparar hashes', async () => {
    quotaState.rateLimited = true;
    const { POST } = await import('@/app/api/auth/login/route');

    await POST(makeRequest({ email: 'user@example.com', password: 'x' }, '/api/auth/login'));

    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('registro responde 429 al superar el tope de la IP', async () => {
    quotaState.rateLimited = true;
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(429);
  });

  it('el bucket del rate limit se separa por IP', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await POST(makeRequest({ email: 'a@b.com', password: 'x' }, '/api/auth/login', '1.1.1.1'));
    await POST(makeRequest({ email: 'a@b.com', password: 'x' }, '/api/auth/login', '2.2.2.2'));

    const buckets = quotaState.calls
      .filter((c) => c.fn === 'kefy_rate_limit_hit')
      .map((c) => c.args.p_bucket);

    expect(buckets).toEqual(['login:ip:1.1.1.1', 'login:ip:2.2.2.2']);
  });

  it('forgot-password responde 429 al superar el tope', async () => {
    quotaState.rateLimited = true;
    const { POST } = await import('@/app/api/auth/forgot-password/route');

    const res = await POST(makeRequest({ email: 'user@example.com' }, '/api/auth/forgot-password'));

    expect(res.status).toBe(429);
  });

  it('reset-password responde 429 al superar el tope', async () => {
    quotaState.rateLimited = true;
    const { POST } = await import('@/app/api/auth/reset-password/route');

    const res = await POST(makeRequest(
      { token: 'abc', password: 'password123' },
      '/api/auth/reset-password',
    ));

    expect(res.status).toBe(429);
  });
});

// ─── Registro transaccional ───────────────────────────────────────────────────
//
// Supabase no expone transacciones desde el cliente REST, así que el handler
// deshace a mano lo ya creado. Si esto se rompe, un fallo a mitad del alta deja
// un usuario que existe, no puede entrar («No organization found») y tampoco
// puede volver a registrarse porque su email figura como tomado.

describe('POST /api/auth/register — atomicidad', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetQuotaState(); resetSubscriptionState();
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$hash' as never);
  });

  /** Registra las tablas sobre las que se ejecutó un delete. */
  function setupChains(opts: {
    orgFails?: boolean;
    brandFails?: boolean;
    membershipFails?: boolean;
    subscriptionFails?: boolean;
  }) {
    const deletedFrom: string[] = [];
    const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
    const record = (table: string) => (values: Record<string, unknown>) => {
      inserted.push({ table, values });
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(function (this: unknown) { return chain; }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        delete: vi.fn(() => { deletedFrom.push(table); return chain; }),
      };

      if (table === 'kefy_users') {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return chain; });
        chain.single = vi.fn().mockResolvedValue({ data: { id: 'user-abc12345' }, error: null });
      } else if (table === 'kefy_organizations') {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return chain; });
        chain.single = vi.fn().mockResolvedValue(
          opts.orgFails
            ? { data: null, error: { message: 'org insert failed' } }
            : { data: { id: 'org-1' }, error: null },
        );
      } else if (table === 'kefy_brands') {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return chain; });
        chain.single = vi.fn().mockResolvedValue(
          opts.brandFails
            ? { data: null, error: { message: 'brand insert failed' } }
            : { data: { id: 'brand-1' }, error: null },
        );
      } else if (table === 'kefy_org_memberships') {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return Promise.resolve(
          opts.membershipFails ? { error: { message: 'membership insert failed' } } : { error: null },
        ); });
      } else if (table === 'kefy_subscriptions') {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return Promise.resolve(
          opts.subscriptionFails ? { error: { message: 'subscription insert failed' } } : { error: null },
        ); });
      } else {
        chain.insert = vi.fn((v: Record<string, unknown>) => { record(table)(v); return Promise.resolve({ error: null }); });
      }

      return chain;
    });

    return { deletedFrom, inserted };
  }

  it('crea la cuenta completa y devuelve 201 en el camino feliz', async () => {
    setupChains({});
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/kefy_access/);
  });

  it('la organización nueva entra en Starter con el mes gratis en curso', async () => {
    const { inserted } = setupChains({});
    const { POST } = await import('@/app/api/auth/register/route');

    await POST(makeRequest(validRegistration, '/api/auth/register'));

    const org = inserted.find((i) => i.table === 'kefy_organizations');
    const sub = inserted.find((i) => i.table === 'kefy_subscriptions');

    expect(org?.values.plan).toBe('starter');
    expect(sub?.values.plan).toBe('starter');
    // El primer mes es gratis: la suscripción nace en prueba, con la fecha de
    // fin ya puesta. Sin ella la cuenta no podría crear nada (ver
    // lib/subscription.ts).
    expect(sub?.values.status).toBe('trialing');

    const fin = new Date(sub?.values.current_period_end as string);
    const dias = Math.round((fin.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    expect(dias).toBe(TRIAL_DAYS);
  });

  // Sin fila de suscripción la cuenta no puede crear nada desde el primer día,
  // que es peor que no haberla creado: su fallo es tan terminal como el resto.
  it('si falla la suscripción, deshace todo el alta', async () => {
    const { deletedFrom } = setupChains({ subscriptionFails: true });
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(500);
    expect(deletedFrom).toContain('kefy_org_memberships');
    expect(deletedFrom).toContain('kefy_brands');
    expect(deletedFrom).toContain('kefy_organizations');
    expect(deletedFrom).toContain('kefy_users');
  });

  it('si falla la organización, borra el usuario ya creado', async () => {
    const { deletedFrom } = setupChains({ orgFails: true });
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(500);
    expect(deletedFrom).toContain('kefy_users');
  });

  it('si falla la marca, borra la organización y el usuario', async () => {
    const { deletedFrom } = setupChains({ brandFails: true });
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(500);
    expect(deletedFrom).toContain('kefy_organizations');
    expect(deletedFrom).toContain('kefy_users');
  });

  // Sin membresía el login responde «No organization found» para siempre: es
  // tan terminal como los pasos anteriores y antes ni siquiera se comprobaba.
  it('si falla la membresía, deshace todo el alta', async () => {
    const { deletedFrom } = setupChains({ membershipFails: true });
    const { POST } = await import('@/app/api/auth/register/route');

    const res = await POST(makeRequest(validRegistration, '/api/auth/register'));

    expect(res.status).toBe(500);
    expect(deletedFrom).toContain('kefy_brands');
    expect(deletedFrom).toContain('kefy_organizations');
    expect(deletedFrom).toContain('kefy_users');
  });

  it('el rollback deshace en orden inverso al de creación', async () => {
    const { deletedFrom } = setupChains({ membershipFails: true });
    const { POST } = await import('@/app/api/auth/register/route');

    await POST(makeRequest(validRegistration, '/api/auth/register'));

    // Las claves foráneas apuntan hacia atrás: la marca depende de la
    // organización, que depende del usuario.
    expect(deletedFrom.indexOf('kefy_brands')).toBeLessThan(deletedFrom.indexOf('kefy_organizations'));
    expect(deletedFrom.indexOf('kefy_organizations')).toBeLessThan(deletedFrom.indexOf('kefy_users'));
  });
});
