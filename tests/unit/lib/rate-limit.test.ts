import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSupabaseClient = { rpc: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

import {
  checkRateLimit,
  windowStart,
  clientIp,
  rateLimitResponse,
  loginRule,
  registerRule,
  aiRule,
  collectExpiredWindows,
  RATE_LIMITS,
} from '@/lib/rate-limit';

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3099/api/auth/login', { headers });
}

describe('windowStart', () => {
  it('trunca al inicio de la ventana', () => {
    // 60 s de ventana: cualquier instante del minuto cae en la misma marca.
    const a = windowStart(new Date('2026-09-01T10:00:15Z').getTime(), 60);
    const b = windowStart(new Date('2026-09-01T10:00:59Z').getTime(), 60);
    expect(a.toISOString()).toBe(b.toISOString());
    expect(a.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('el instante siguiente cae en la ventana siguiente', () => {
    const a = windowStart(new Date('2026-09-01T10:00:59Z').getTime(), 60);
    const b = windowStart(new Date('2026-09-01T10:01:00Z').getTime(), 60);
    expect(a.toISOString()).not.toBe(b.toISOString());
  });
});

describe('clientIp', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }))).toBe('1.2.3.4');
  });

  it('cae en x-real-ip si no hay x-forwarded-for', () => {
    expect(clientIp(req({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
  });

  it('devuelve un marcador cuando no hay ninguna cabecera', () => {
    expect(clientIp(req())).toBe('desconocida');
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('permite mientras el conteo no supere el tope', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 3, error: null });

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(2);
  });

  it('permite justo en el tope (el límite es inclusivo)', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 5, error: null });

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(0);
  });

  it('bloquea al pasarse del tope', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 6, error: null });

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it('llama a la función SQL con el bucket y el inicio de ventana', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 1, error: null });

    await checkRateLimit(
      { bucket: 'login:ip:1.2.3.4', limit: 10, windowSeconds: 300 },
      new Date('2026-09-01T10:07:33Z').getTime(),
    );

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_rate_limit_hit', {
      p_bucket: 'login:ip:1.2.3.4',
      p_window_start: '2026-09-01T10:05:00.000Z',
    });
  });

  it('calcula el retryAfter hasta el fin de la ventana', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 99, error: null });

    const res = await checkRateLimit(
      { bucket: 'test', limit: 5, windowSeconds: 60 },
      new Date('2026-09-01T10:00:20Z').getTime(),
    );

    expect(res.retryAfter).toBe(40);
  });

  // Si el limitador cayera cerrado, una caída de Supabase dejaría a todo el
  // mundo sin poder entrar. Se prefiere un rato sin límite a un servicio caído.
  it('deja pasar si la base de datos falla', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(true);
  });

  it('deja pasar si la RPC lanza', async () => {
    mockSupabaseClient.rpc.mockRejectedValue(new Error('boom'));

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(true);
  });

  it('deja pasar si la RPC devuelve algo que no es un número', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 'no-es-un-numero', error: null });

    const res = await checkRateLimit({ bucket: 'test', limit: 5, windowSeconds: 60 });

    expect(res.allowed).toBe(true);
  });
});

describe('rateLimitResponse', () => {
  it('responde 429 con las cabeceras estándar', async () => {
    const res = rateLimitResponse(
      { allowed: false, limit: 10, remaining: 0, retryAfter: 42 },
      'Demasiados intentos',
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(await res.json()).toEqual({ error: 'Demasiados intentos', retryAfter: 42 });
  });
});

describe('reglas', () => {
  it('los buckets separan por IP y por organización', () => {
    expect(loginRule('1.2.3.4').bucket).toBe('login:ip:1.2.3.4');
    expect(loginRule('5.6.7.8').bucket).not.toBe(loginRule('1.2.3.4').bucket);
    expect(aiRule('org-1').bucket).toBe('ai:org:org-1');
  });

  it('los buckets de reglas distintas no colisionan para la misma IP', () => {
    expect(loginRule('1.2.3.4').bucket).not.toBe(registerRule('1.2.3.4').bucket);
  });

  it('el registro es más estricto que el login', () => {
    expect(RATE_LIMITS.register.limit).toBeLessThan(RATE_LIMITS.login.limit);
    expect(RATE_LIMITS.register.windowSeconds).toBeGreaterThan(RATE_LIMITS.login.windowSeconds);
  });
});

describe('collectExpiredWindows', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('borra las ventanas anteriores al corte', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 42, error: null });

    const borradas = await collectExpiredWindows(
      24 * 60 * 60,
      new Date('2026-09-02T00:00:00Z').getTime(),
    );

    expect(borradas).toBe(42);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_rate_limit_gc', {
      p_older_than: '2026-09-01T00:00:00.000Z',
    });
  });

  // El corte por defecto (1 día) queda muy por encima de la ventana más larga
  // en uso (1 h), así que la limpieza nunca borra una ventana viva.
  it('el corte por defecto es más antiguo que la ventana más larga', () => {
    const ventanaMasLarga = Math.max(
      ...Object.values(RATE_LIMITS).map((r) => r.windowSeconds),
    );
    expect(24 * 60 * 60).toBeGreaterThan(ventanaMasLarga);
  });

  // Es mantenimiento: no puede tumbar la ejecución del cron que la invoca.
  it('devuelve 0 sin lanzar si la limpieza falla', async () => {
    mockSupabaseClient.rpc.mockRejectedValue(new Error('boom'));

    await expect(collectExpiredWindows()).resolves.toBe(0);
  });
});
