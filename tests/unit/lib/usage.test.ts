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
  creditsExhaustedBody,
  PLAN_CREDITS,
  CREDIT_COSTS,
  PLAN_ASSISTANT_MESSAGES,
  assistantMessagesFor,
  consumeAssistantMessage,
  refundAssistantMessage,
  getAssistantUsage,
  assistantQuotaExhaustedBody,
} from '@/lib/usage';
import es from '@/locales/es/landing';
import en from '@/locales/en/landing';

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

describe('creditsExhaustedBody', () => {
  const agotado = {
    allowed: false, used: 150, limit: 150, remaining: 0,
    cost: CREDIT_COSTS.image, operation: 'image' as const,
  };

  // Las herramientas del asistente devuelven este cuerpo tal cual: tiene que
  // ser exactamente el de la respuesta HTTP.
  it('es exactamente el cuerpo de creditsExhaustedResponse', async () => {
    for (const lang of ['es', 'en'] as const) {
      expect(creditsExhaustedBody(agotado, lang)).toEqual(await creditsExhaustedResponse(agotado, lang).json());
    }
  });
});

// ─── Cuota del asistente ──────────────────────────────────────────────────────

/** Formato de miles de la landing: 1500 → '1,500'. */
function formatoLanding(n: number): string {
  return n.toLocaleString('en-US');
}

describe('PLAN_ASSISTANT_MESSAGES', () => {
  // Estos números los anuncia la página de precios en la lista de cada plan.
  // Si dejan de coincidir, la landing vuelve a prometer algo que no existe.
  it('coincide con lo que anuncia la lista de cada plan, en ambos idiomas', () => {
    const planes = ['starter', 'pro', 'business'] as const;
    for (const [idioma, copy] of [['es', es], ['en', en]] as const) {
      const patron = idioma === 'es' ? /^Asistente IA: ([\d,]+) mensajes \/ mes$/ : /^AI assistant: ([\d,]+) messages \/ month$/;
      copy.pricing.plans.forEach((plan, i) => {
        const lineas = plan.features
          .map((f) => (typeof f === 'string' ? f : f.t))
          .filter((t) => patron.test(t));
        expect(lineas, `[${idioma}] ${plan.name}: falta la línea del asistente`).toHaveLength(1);
        const numero = lineas[0].match(patron)![1];
        expect(numero, `[${idioma}] ${plan.name}`).toBe(formatoLanding(PLAN_ASSISTANT_MESSAGES[planes[i]]));
      });
    }
  });

  it('coincide con lo acordado', () => {
    expect(PLAN_ASSISTANT_MESSAGES).toEqual({ starter: 300, pro: 1500, business: 5000 });
  });

  it('los mensajes crecen con el plan', () => {
    expect(PLAN_ASSISTANT_MESSAGES.starter).toBeLessThan(PLAN_ASSISTANT_MESSAGES.pro);
    expect(PLAN_ASSISTANT_MESSAGES.pro).toBeLessThan(PLAN_ASSISTANT_MESSAGES.business);
  });

  it('la landing aclara que chatear no gasta créditos', () => {
    expect(es.pricing.creditNote).toMatch(/asistente/i);
    expect(en.pricing.creditNote).toMatch(/assistant/i);
  });
});

describe('assistantMessagesFor', () => {
  it('devuelve los mensajes del plan', () => {
    expect(assistantMessagesFor('business')).toBe(PLAN_ASSISTANT_MESSAGES.business);
  });

  it('un plan desconocido cae en el tramo más bajo', () => {
    expect(assistantMessagesFor('inventado')).toBe(PLAN_ASSISTANT_MESSAGES.starter);
  });
});

describe('consumeAssistantMessage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('descuenta un mensaje contra el tope del plan', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 7, error: null });

    const res = await consumeAssistantMessage('org-1', 'pro', new Date('2026-09-15T00:00:00Z'));

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_assistant_consume', {
      p_org_id: 'org-1',
      p_period: '2026-09',
      p_limit: PLAN_ASSISTANT_MESSAGES.pro,
    });
    expect(res).toEqual({
      allowed: true, used: 7, limit: PLAN_ASSISTANT_MESSAGES.pro,
      remaining: PLAN_ASSISTANT_MESSAGES.pro - 7,
    });
  });

  it('no toca los créditos de IA', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: 1, error: null });

    await consumeAssistantMessage('org-1', 'starter');

    const fns = mockSupabaseClient.rpc.mock.calls.map((c) => c[0]);
    expect(fns).not.toContain('kefy_credits_consume');
  });

  it('bloquea cuando la función devuelve -1', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: -1, error: null });

    const res = await consumeAssistantMessage('org-1', 'starter');

    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.used).toBe(PLAN_ASSISTANT_MESSAGES.starter);
  });

  it('falla cerrado si la base de datos falla', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    await expect(consumeAssistantMessage('org-1', 'starter')).rejects.toThrow(/asistente/i);
  });
});

describe('refundAssistantMessage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('devuelve un mensaje del período', async () => {
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });

    await refundAssistantMessage('org-1', new Date('2026-09-15T00:00:00Z'));

    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('kefy_assistant_refund', {
      p_org_id: 'org-1',
      p_period: '2026-09',
    });
  });

  it('no lanza si el reembolso falla', async () => {
    mockSupabaseClient.rpc.mockRejectedValue(new Error('boom'));

    await expect(refundAssistantMessage('org-1')).resolves.toBeUndefined();
  });
});

describe('getAssistantUsage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  function mockCounter(row: Record<string, number> | null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    mockSupabaseClient.from.mockReturnValue(chain);
    return chain;
  }

  it('lee la columna de mensajes, no la de créditos', async () => {
    const chain = mockCounter({ assistant_messages: 40, credits: 120 });

    const usage = await getAssistantUsage('org-1', 'starter');

    expect(chain.select).toHaveBeenCalledWith('assistant_messages');
    expect(usage.used).toBe(40);
    expect(usage.limit).toBe(PLAN_ASSISTANT_MESSAGES.starter);
    expect(usage.remaining).toBe(PLAN_ASSISTANT_MESSAGES.starter - 40);
  });

  it('un mes sin mensajes cuenta como cero', async () => {
    mockCounter(null);

    const usage = await getAssistantUsage('org-1', 'business');

    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(PLAN_ASSISTANT_MESSAGES.business);
  });
});

describe('assistantQuotaExhaustedBody', () => {
  // El widget usa el flag para distinguirlo de los créditos agotados y del
  // rate limit, y ofrecer mejorar el plan.
  it('marca assistantQuotaExhausted y no creditsExhausted', () => {
    const body = assistantQuotaExhaustedBody({ limit: 300, used: 300 });

    expect(body.assistantQuotaExhausted).toBe(true);
    expect(body).not.toHaveProperty('creditsExhausted');
    expect(body.limit).toBe(300);
    expect(body.used).toBe(300);
  });

  it('traduce el mensaje al idioma pedido', () => {
    expect(assistantQuotaExhaustedBody({ limit: 300, used: 300 }, 'en').error).toMatch(/assistant messages/i);
    expect(assistantQuotaExhaustedBody({ limit: 300, used: 300 }, 'es').error).toMatch(/mensajes del asistente/i);
  });
});
