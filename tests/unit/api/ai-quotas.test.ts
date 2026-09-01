import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  fakeRpc, resetQuotaState, quotaState, consumedCount, creditsSpent, refundCount,
  resetSubscriptionState, subscriptionState,
} from '../helpers/quota';

// Verifica que las cuotas y el rate limit están realmente conectados a cada
// ruta que gasta dinero, y no solo implementados en la librería.
//
// Es la red de seguridad del gasto de la beta abierta: si alguien añade una
// ruta de generación sin guard, o quita el guard de una existente, aquí se ve.

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

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/brands', () => ({ getBrandFromRequest: vi.fn() }));

vi.mock('@/lib/ai', () => ({
  generateContentText: vi.fn(),
  generateContentImage: vi.fn(),
  generateCarouselSlides: vi.fn(),
  generateReelScript: vi.fn(),
  generateSlideText: vi.fn(),
  generateLibraryContent: vi.fn(),
  generateContentRecommendations: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({ uploadBase64Image: vi.fn().mockResolvedValue('https://cdn/x.jpg') }));

import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import {
  generateContentText, generateCarouselSlides, generateSlideText, generateContentImage,
} from '@/lib/ai';
import { PLAN_CREDITS, CREDIT_COSTS } from '@/lib/usage';

const mockAuth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'starter' };
const mockBrand = {
  id: 'brand-1', org_id: 'org-1', name: 'Marca', slug: 'marca',
  avatar_url: null, archived: false, created_at: '', updated_at: '',
};

function postReq(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3099${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Cadena de Supabase que responde vacío a cualquier consulta. */
function emptyChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'delete', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: { id: 'item-1' }, error: null });
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetQuotaState(); resetSubscriptionState();
  vi.mocked(getAuthFromRequest).mockResolvedValue(mockAuth as never);
  vi.mocked(getBrandFromRequest).mockResolvedValue({ brand: mockBrand } as never);
  mockSupabaseClient.from.mockImplementation(() => emptyChain());
});

// ─── Cuota agotada ────────────────────────────────────────────────────────────

describe('cuota agotada bloquea la generación', () => {
  const cases: Array<{ name: string; path: string; module: string; body: unknown }> = [
    {
      name: 'POST /api/content/generate',
      path: '/api/content/generate',
      module: '@/app/api/content/generate/route',
      body: { topic: 'lanzamiento', channel: 'instagram' },
    },
    {
      name: 'POST /api/content/carousel',
      path: '/api/content/carousel',
      module: '@/app/api/content/carousel/route',
      body: { topic: 'lanzamiento', slide_count: 3 },
    },
    {
      name: 'POST /api/content/slide-text',
      path: '/api/content/slide-text',
      module: '@/app/api/content/slide-text/route',
      body: { kind: 'title', title: 'Hola' },
    },
  ];

  for (const c of cases) {
    it(`${c.name} responde 429 sin llamar al proveedor de IA`, async () => {
      quotaState.quotaAllowed = false;
      const { POST } = await import(c.module);

      const res = await POST(postReq(c.path, c.body));

      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.creditsExhausted).toBe(true);
      // Lo esencial: sin cuota no se llama al proveedor, así que no se gasta.
      expect(generateContentText).not.toHaveBeenCalled();
      expect(generateCarouselSlides).not.toHaveBeenCalled();
      expect(generateSlideText).not.toHaveBeenCalled();
    });

    it(`${c.name} responde 429 al superar el rate limit`, async () => {
      quotaState.rateLimited = true;
      const { POST } = await import(c.module);

      const res = await POST(postReq(c.path, c.body));

      expect(res.status).toBe(429);
      const json = await res.json();
      // Rate limit ≠ cuota: este se reintenta, el otro pide mejorar el plan.
      expect(json.creditsExhausted).toBeUndefined();
    });
  }
});

// ─── Consumo y reembolso ──────────────────────────────────────────────────────

describe('POST /api/content/generate — contabilidad de cuota', () => {
  it('consume una unidad de texto en una generación correcta', async () => {
    vi.mocked(generateContentText).mockResolvedValue({
      body: 'texto', hashtags: ['#a'], model: 'claude', tokensUsed: 10,
    } as never);
    const { POST } = await import('@/app/api/content/generate/route');

    await POST(postReq('/api/content/generate', {
      topic: 'lanzamiento', channel: 'instagram', save: false,
    }));

    expect(consumedCount(CREDIT_COSTS.text)).toBe(1);
    expect(refundCount()).toBe(0);
  });

  // Un fallo del proveedor no es culpa del usuario: no se le descuenta.
  it('devuelve la cuota si el proveedor de IA falla', async () => {
    vi.mocked(generateContentText).mockRejectedValue(new Error('anthropic 500'));
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', {
      topic: 'lanzamiento', channel: 'instagram',
    }));

    expect(res.status).toBe(502);
    expect(consumedCount(CREDIT_COSTS.text)).toBe(1);
    expect(refundCount()).toBe(1);
  });

  // El cuerpo se valida antes del guard: un 422 no debe costarle cuota a nadie.
  it('una petición inválida no consume cuota', async () => {
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', { channel: 'instagram' }));

    expect(res.status).toBe(422);
    expect(consumedCount(CREDIT_COSTS.text)).toBe(0);
  });

  it('una petición sin sesión no consume cuota', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', { topic: 'x' }));

    expect(res.status).toBe(401);
    expect(quotaState.calls).toHaveLength(0);
  });

  it('aplica el tope del plan de la organización', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue({ ...mockAuth, plan: 'business' } as never);
    vi.mocked(generateContentText).mockResolvedValue({
      body: 'texto', hashtags: [], model: 'claude', tokensUsed: 5,
    } as never);
    const { POST } = await import('@/app/api/content/generate/route');

    await POST(postReq('/api/content/generate', { topic: 'x', save: false }));

    const consume = quotaState.calls.find((c) => c.fn === 'kefy_credits_consume');
    expect(consume?.args.p_limit).toBe(PLAN_CREDITS.business);
  });
});

// ─── Carrusel: una imagen por slide ───────────────────────────────────────────

describe('POST /api/content/carousel — cuota por slide', () => {
  it('consume una unidad de imagen por cada slide generado', async () => {
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'aGkK', model: 'gpt-image' } as never);
    vi.mocked(generateCarouselSlides).mockResolvedValue({
      slides: [
        { slide_order: 1, title: 'A', body: 'a', image_prompt: 'p1' },
        { slide_order: 2, title: 'B', body: 'b', image_prompt: 'p2' },
        { slide_order: 3, title: 'C', body: 'c', image_prompt: 'p3' },
      ],
      description: 'desc', hashtags: [], model: 'claude', tokensUsed: 20,
    } as never);

    const { POST } = await import('@/app/api/content/carousel/route');

    await POST(postReq('/api/content/carousel', {
      topic: 'lanzamiento', slide_count: 3, generate_images: true, save: false,
    }));

    expect(consumedCount(CREDIT_COSTS.text)).toBe(1);
    expect(consumedCount(CREDIT_COSTS.image)).toBe(3);
  });

  it('sin generación de imágenes solo consume la cuota de texto', async () => {
    vi.mocked(generateCarouselSlides).mockResolvedValue({
      slides: [{ slide_order: 1, title: 'A', body: 'a', image_prompt: 'p1' }],
      description: 'desc', hashtags: [], model: 'claude', tokensUsed: 20,
    } as never);

    const { POST } = await import('@/app/api/content/carousel/route');

    await POST(postReq('/api/content/carousel', {
      topic: 'x', slide_count: 1, generate_images: false, save: false,
    }));

    expect(consumedCount(CREDIT_COSTS.text)).toBe(1);
    expect(consumedCount(CREDIT_COSTS.image)).toBe(0);
  });

  it('devuelve la cuota de las imágenes que fallaron', async () => {
    vi.mocked(generateCarouselSlides).mockResolvedValue({
      slides: [
        { slide_order: 1, title: 'A', body: 'a', image_prompt: 'p1' },
        { slide_order: 2, title: 'B', body: 'b', image_prompt: 'p2' },
      ],
      description: 'desc', hashtags: [], model: 'claude', tokensUsed: 20,
    } as never);
    vi.mocked(generateContentImage).mockRejectedValue(new Error('image provider down'));

    const { POST } = await import('@/app/api/content/carousel/route');

    await POST(postReq('/api/content/carousel', {
      topic: 'x', slide_count: 2, generate_images: true, save: false,
    }));

    // Se cobraron dos imágenes y las dos se devolvieron: saldo neto cero.
    expect(consumedCount(CREDIT_COSTS.image)).toBe(2);
    expect(refundCount()).toBe(2);
  });
});

// ─── Consumo visible para la UI ───────────────────────────────────────────────

describe('GET /api/auth/me — consumo del mes', () => {
  /** Cadena de `kefy_usage_counters`, terminada en `.maybeSingle()`. */
  function usageChain(credits: number | null) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: credits === null ? null : { credits },
      error: null,
    }));
    return chain;
  }

  it('devuelve el consumo junto al usuario y la organización', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'kefy_users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1', email: 'a@b.com', name: 'A' } }),
        };
      }
      if (table === 'kefy_organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'org-1', plan: 'starter' } }),
        };
      }
      return usageChain(7);
    });

    const { GET } = await import('@/app/api/auth/me/route');
    const res = await GET(new NextRequest('http://localhost:3099/api/auth/me'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.used).toBe(7);
    expect(body.usage.limit).toBe(PLAN_CREDITS.starter);
    expect(body.usage.remaining).toBe(PLAN_CREDITS.starter - 7);
  });

  // El consumo es informativo: su fallo no puede tumbar la carga del dashboard.
  it('sigue respondiendo 200 aunque no se pueda leer el consumo', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'kefy_users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u1', email: 'a@b.com', name: 'A' } }),
        };
      }
      if (table === 'kefy_organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'org-1', plan: 'starter' } }),
        };
      }
      throw new Error('contadores no disponibles');
    });

    const { GET } = await import('@/app/api/auth/me/route');
    const res = await GET(new NextRequest('http://localhost:3099/api/auth/me'));

    expect(res.status).toBe(200);
    expect((await res.json()).usage).toBeNull();
  });
});

// ─── Bloqueo por suscripción a nivel de ruta ──────────────────────────────────
//
// `guardAiRequest` devuelve 402 con el trial vencido; esto verifica que las
// rutas están realmente conectadas a él y no solo la librería.

describe('mes gratis vencido bloquea la generación', () => {
  it('POST /api/content/generate responde 402 sin llamar al proveedor', async () => {
    subscriptionState.daysLeft = -1;
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', { topic: 'x', channel: 'instagram' }));

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.subscriptionRequired).toBe(true);
    expect(body.reason).toBe('trial_expired');
    expect(generateContentText).not.toHaveBeenCalled();
  });

  // Lo que se corta es crear, no leer: una cuenta bloqueada no debe llegar
  // siquiera a descontar créditos.
  it('una cuenta bloqueada no descuenta créditos', async () => {
    subscriptionState.daysLeft = -1;
    const { POST } = await import('@/app/api/content/carousel/route');

    await POST(postReq('/api/content/carousel', { topic: 'x', slide_count: 3 }));

    expect(creditsSpent()).toBe(0);
  });

  it('con el pago fallido el motivo es payment_failed', async () => {
    subscriptionState.status = 'past_due';
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', { topic: 'x' }));

    expect(res.status).toBe(402);
    expect((await res.json()).reason).toBe('payment_failed');
  });

  it('con el trial vigente la generación sigue su curso', async () => {
    subscriptionState.daysLeft = 5;
    vi.mocked(generateContentText).mockResolvedValue({
      body: 'texto', hashtags: [], model: 'claude', tokensUsed: 5,
    } as never);
    const { POST } = await import('@/app/api/content/generate/route');

    const res = await POST(postReq('/api/content/generate', { topic: 'x', save: false }));

    expect(res.status).toBe(200);
  });
});

// ─── Coste ponderado a nivel de ruta ──────────────────────────────────────────

describe('cada operación descuenta lo que cuesta', () => {
  it('un carrusel de 3 slides con imágenes descuenta texto + 3 imágenes', async () => {
    vi.mocked(generateCarouselSlides).mockResolvedValue({
      slides: [1, 2, 3].map((n) => ({
        slide_order: n, title: `T${n}`, body: `b${n}`, image_prompt: `p${n}`,
      })),
      description: 'desc', hashtags: [], model: 'claude', tokensUsed: 20,
    } as never);
    vi.mocked(generateContentImage).mockResolvedValue({ b64: 'aGkK', model: 'gpt-image' } as never);

    const { POST } = await import('@/app/api/content/carousel/route');
    await POST(postReq('/api/content/carousel', {
      topic: 'x', slide_count: 3, generate_images: true, save: false,
    }));

    expect(creditsSpent()).toBe(CREDIT_COSTS.text + 3 * CREDIT_COSTS.image);
  });
});
