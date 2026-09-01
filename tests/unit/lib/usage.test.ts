import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseClient = { rpc: vi.fn(), from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

import {
  consumeCredits,
  refundCredits,
  getUsage,
  usagePeriod,
  creditsFor,
  costOf,
  creditsExhaustedResponse,
  PLAN_CREDITS,
  CREDIT_COSTS,
} from '@/lib/usage';

describe('usagePeriod', () => {
  it('devuelve el mes en UTC con dos dígitos', () => {
    expect(usagePeriod(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
    expect(usagePeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('usa UTC y no la zona horaria local', () => {
    // 23:30 UTC del 30 de septiembre sigue siendo septiembre, no octubre.
    expect(usagePeriod(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09');
  });
});

describe('PLAN_CREDITS', () => {
  // Estos números son los que anuncia la página de precios. Si cambian aquí,
  // hay que cambiarlos en locales/*/landing.ts.
  it('coincide con lo que vende la página de precios', () => {
    expect(PLAN_CREDITS.starter).toBe(150);
    expect(PLAN_CREDITS.pro).toBe(500);
    expect(PLAN_CREDITS.business).toBe(2000);
  });

  it('los créditos crecen con el plan', () => {
    expect(PLAN_CREDITS.starter).toBeLessThan(PLAN_CREDITS.pro);
    expect(PLAN_CREDITS.pro).toBeLessThan(PLAN_CREDITS.business);
  });
});

describe('CREDIT_COSTS', () => {
  // Sin ponderar, los 150 créditos de Starter podrían gastarse en 150 renders
  // de video, que cuestan órdenes de magnitud más que 150 captions.
  it('el coste sube con lo que cuesta ejecutar la operación', () => {
    expect(CREDIT_COSTS.text).toBeLessThan(CREDIT_COSTS.image);
    expect(CREDIT_COSTS.image).toBeLessThan(CREDIT_COSTS.video);
  });

  it('hasta la operación más cara cabe en el plan más barato', () => {
    expect(CREDIT_COSTS.video).toBeLessThanOrEqual(PLAN_CREDITS.starter);
  });
});

describe('creditsFor', () => {
  it('devuelve los créditos del plan', () => {
    expect(creditsFor('pro')).toBe(PLAN_CREDITS.pro);
  });

  // Ante un plan desconocido no se puede regalar gasto en IA.
  it('un plan desconocido cae en el tramo más bajo', () => {
    expect(creditsFor('inventado')).toBe(PLAN_CREDITS.starter);
  });
});

describe('consumeCredits', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('permite y descuenta cuando quedan créditos', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 12, error: null });

    const res = await consumeCredits('org-1', 'starter', 'image', new Date('2026-09-15T00:00:00Z'));

    expect(res.allowed).toBe(true);
    expect(res.used).toBe(12);
    expect(res.cost).toBe(CREDIT_COSTS.image);
    expect(res.limit).toBe(PLAN_CREDITS.starter);
    expect(res.remaining).toBe(PLAN_CREDITS.starter - 12);
  });

  it('descuenta el peso de la operación, no una unidad', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 10, error: null });

    await consumeCredits('org-1', 'starter', 'video', new Date('2026-09-15T00:00:00Z'));

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_credits_consume', {
      p_org_id: 'org-1',
      p_period: '2026-09',
      p_amount: CREDIT_COSTS.video,
      p_limit: PLAN_CREDITS.starter,
    });
  });

  // -1 es la señal de kefy_credits_consume: no cabía en lo que quedaba del mes.
  it('bloquea cuando la función devuelve -1', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: -1, error: null });

    const res = await consumeCredits('org-1', 'starter', 'video');

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  // Al revés que el rate limiter: sin poder verificar el saldo no se autoriza
  // gasto, porque el riesgo aquí es una factura, no una caída.
  it('falla cerrado si la base de datos falla', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    await expect(consumeCredits('org-1', 'starter', 'text')).rejects.toThrow(/créditos/i);
  });
});

describe('refundCredits', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve exactamente lo que costó la operación', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });

    await refundCredits('org-1', 'video', new Date('2026-09-15T00:00:00Z'));

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_credits_refund', {
      p_org_id: 'org-1',
      p_period: '2026-09',
      p_amount: CREDIT_COSTS.video,
    });
  });

  // El reembolso ocurre dentro de un camino que ya está gestionando otro error:
  // si además lanzara, taparía el error original.
  it('no lanza si el reembolso falla', async () => {
    mockSupabaseClient.rpc.mockRejectedValue(new Error('boom'));

    await expect(refundCredits('org-1', 'text')).resolves.toBeUndefined();
  });
});

describe('getUsage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  function mockCounter(credits: number | null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: credits === null ? null : { credits }, error: null,
    }));
    mockSupabaseClient.from.mockReturnValue(chain);
  }

  it('combina el consumo guardado con el tope del plan', async () => {
    mockCounter(60);

    const usage = await getUsage('org-1', 'starter');

    expect(usage.used).toBe(60);
    expect(usage.limit).toBe(PLAN_CREDITS.starter);
    expect(usage.remaining).toBe(PLAN_CREDITS.starter - 60);
  });

  it('un mes sin consumo cuenta como cero, no como indefinido', async () => {
    mockCounter(null);

    const usage = await getUsage('org-1', 'pro');

    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(PLAN_CREDITS.pro);
  });
});

describe('creditsExhaustedResponse', () => {
  const agotado = {
    allowed: false, used: 150, limit: 150, remaining: 0,
    cost: CREDIT_COSTS.video, operation: 'video' as const,
  };

  it('responde 429 marcado como créditos, no como rate limit', async () => {
    const res = creditsExhaustedResponse(agotado);

    expect(res.status).toBe(429);
    const body = await res.json();
    // El cliente usa este flag para ofrecer mejorar el plan en vez de reintentar.
    expect(body.creditsExhausted).toBe(true);
    expect(body.limit).toBe(150);
    expect(body.operation).toBe('video');
  });

  it('traduce el mensaje al idioma pedido', async () => {
    const en = await creditsExhaustedResponse(agotado, 'en').json();
    const es = await creditsExhaustedResponse(agotado, 'es').json();

    expect(en.error).toMatch(/credits/i);
    expect(es.error).toMatch(/créditos/i);
  });
});

describe('costOf', () => {
  it('expone el peso de cada operación', () => {
    expect(costOf('text')).toBe(CREDIT_COSTS.text);
    expect(costOf('video')).toBe(CREDIT_COSTS.video);
  });
});
