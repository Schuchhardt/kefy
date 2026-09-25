import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSupabaseClient = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/usage', () => ({
  getUsage: vi.fn().mockResolvedValue({ used: 0, limit: 150, remaining: 150, period: '2026-09' }),
}));

vi.mock('@/lib/subscription', () => ({
  getEntitlement: vi.fn().mockResolvedValue({
    canCreate: true, status: 'active', isTrialing: false,
    periodEnd: null, trialDaysLeft: null, reason: null,
  }),
}));

import { getAuthFromRequest } from '@/lib/auth';

function req() {
  return new NextRequest('http://localhost:3099/api/auth/me');
}

/** userId/orgId fijos; `plan` es el del JWT (puede estar desactualizado). */
function auth(overrides: Partial<Record<string, unknown>> = {}) {
  return { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro', ...overrides };
}

/**
 * `kefy_users` y `kefy_organizations` son las dos únicas tablas que toca la
 * ruta antes del chequeo de invalidación. `org` puede ser `null` para
 * simular una org borrada.
 */
function setupTables(org: Record<string, unknown> | null) {
  mockSupabaseClient.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
    if (table === 'kefy_users') {
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'u1', email: 'a@b.com', name: 'A', created_at: '2026-01-01' }, error: null,
      });
    } else if (table === 'kefy_organizations') {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: org, error: null });
    } else {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    }
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/auth/me', () => {
  it('devuelve 401 sin sesión', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/auth/me/route');

    expect((await GET(req())).status).toBe(401);
  });

  // Bug real: el endpoint calculaba effectivePlan (fresco) para los créditos
  // pero devolvía auth.plan (el del JWT, potencialmente viejo) en el campo
  // `plan` de la respuesta — dashboard y créditos podían mostrar planes
  // distintos. Ver app/api/auth/me/route.ts.
  it('devuelve el plan de la organización, no el del JWT, cuando difieren', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(auth({ plan: 'pro' }) as never);
    setupTables({ id: 'org-1', name: 'Acme', slug: 'acme', plan: 'business', session_invalidated_at: null });
    const { GET } = await import('@/app/api/auth/me/route');

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.plan).toBe('business');
  });

  it('sin session_invalidated_at, un token viejo sigue sirviendo', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(auth({ iat: 1000 }) as never);
    setupTables({ id: 'org-1', name: 'Acme', slug: 'acme', plan: 'pro', session_invalidated_at: null });
    const { GET } = await import('@/app/api/auth/me/route');

    expect((await GET(req())).status).toBe(200);
  });

  // scripts/grant-comp-plan.ts marca session_invalidated_at al regalar un
  // plan, justamente para forzar esto: un token emitido antes de esa marca
  // queda inválido aunque no haya expirado.
  it('rechaza un token emitido antes de session_invalidated_at y limpia las cookies', async () => {
    const invalidatedAt = new Date('2026-09-25T20:00:00Z');
    const iatBefore = Math.floor(invalidatedAt.getTime() / 1000) - 60; // 1 min antes

    vi.mocked(getAuthFromRequest).mockResolvedValue(auth({ iat: iatBefore }) as never);
    setupTables({
      id: 'org-1', name: 'Acme', slug: 'acme', plan: 'business',
      session_invalidated_at: invalidatedAt.toISOString(),
    });
    const { GET } = await import('@/app/api/auth/me/route');

    const res = await GET(req());
    expect(res.status).toBe(401);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('kefy_access=');
    expect(setCookie).toMatch(/kefy_access=;|kefy_access=""/);
  });

  it('un token emitido después de session_invalidated_at (relogueo) sigue sirviendo', async () => {
    const invalidatedAt = new Date('2026-09-25T20:00:00Z');
    const iatAfter = Math.floor(invalidatedAt.getTime() / 1000) + 60; // 1 min después

    vi.mocked(getAuthFromRequest).mockResolvedValue(auth({ iat: iatAfter, plan: 'business' }) as never);
    setupTables({
      id: 'org-1', name: 'Acme', slug: 'acme', plan: 'business',
      session_invalidated_at: invalidatedAt.toISOString(),
    });
    const { GET } = await import('@/app/api/auth/me/route');

    const res = await GET(req());
    expect(res.status).toBe(200);
  });
});
