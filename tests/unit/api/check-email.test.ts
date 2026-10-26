import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));

vi.mock('@/lib/supabase', () => ({
  createSupabaseServer: () => ({ from: () => ({ select: () => ({ eq }) }) }),
}));

const rateLimit = { allowed: true };
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    checkRateLimit: async () => ({ ...rateLimit, limit: 20, remaining: 0, retryAfter: 60 }),
  };
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3097/api/auth/check-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── POST /api/auth/check-email ───────────────────────────────────────────────

describe('POST /api/auth/check-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.allowed = true;
  });

  it('devuelve 400 si el email es inválido', async () => {
    const { POST } = await import('@/app/api/auth/check-email/route');
    const res = await POST(makeRequest({ email: 'no-es-email' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_email');
  });

  it('dice que existe y busca el email normalizado', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'u1' }, error: null });
    const { POST } = await import('@/app/api/auth/check-email/route');
    const res = await POST(makeRequest({ email: '  Ana@Ejemplo.com ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
    expect(eq).toHaveBeenCalledWith('email', 'ana@ejemplo.com');
  });

  it('dice que no existe cuando no hay usuario', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('@/app/api/auth/check-email/route');
    const res = await POST(makeRequest({ email: 'nueva@ejemplo.com' }));
    expect(await res.json()).toEqual({ exists: false });
  });

  it('corta con 429 al pasar el rate limit, sin consultar la base', async () => {
    rateLimit.allowed = false;
    const { POST } = await import('@/app/api/auth/check-email/route');
    const res = await POST(makeRequest({ email: 'ana@ejemplo.com' }));
    expect(res.status).toBe(429);
    expect(eq).not.toHaveBeenCalled();
  });
});
