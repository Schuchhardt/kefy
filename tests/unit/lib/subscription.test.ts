import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseClient = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

import {
  resolveEntitlement,
  getEntitlement,
  requireActiveSubscription,
  trialEndsAt,
  blockMessage,
  TRIAL_DAYS,
} from '@/lib/subscription';

const AHORA = new Date('2026-09-15T12:00:00Z');

/** Fecha a N días de `AHORA`. Negativo = en el pasado. */
function enDias(n: number): string {
  return new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

describe('trialEndsAt', () => {
  it('el mes gratis dura TRIAL_DAYS días', () => {
    const fin = trialEndsAt(AHORA);
    const dias = (fin.getTime() - AHORA.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(TRIAL_DAYS);
  });
});

describe('resolveEntitlement', () => {
  it('trial vigente: puede crear y sabe cuántos días le quedan', () => {
    const e = resolveEntitlement({ status: 'trialing', current_period_end: enDias(8) }, AHORA);

    expect(e.canCreate).toBe(true);
    expect(e.isTrialing).toBe(true);
    expect(e.trialDaysLeft).toBe(8);
    expect(e.reason).toBeNull();
  });

  // El corazón del modelo: al vencer el mes gratis se deja de poder crear, pero
  // eso es todo — el resto de la cuenta sigue accesible.
  it('trial vencido: no puede crear, con motivo trial_expired', () => {
    const e = resolveEntitlement({ status: 'trialing', current_period_end: enDias(-1) }, AHORA);

    expect(e.canCreate).toBe(false);
    expect(e.reason).toBe('trial_expired');
    expect(e.trialDaysLeft).toBe(0);
  });

  it('el trial vence exactamente al llegar la fecha, no después', () => {
    const justoAntes = resolveEntitlement(
      { status: 'trialing', current_period_end: new Date(AHORA.getTime() + 1000).toISOString() },
      AHORA,
    );
    const justoDespues = resolveEntitlement(
      { status: 'trialing', current_period_end: AHORA.toISOString() },
      AHORA,
    );

    expect(justoAntes.canCreate).toBe(true);
    expect(justoDespues.canCreate).toBe(false);
  });

  it('suscripción activa: puede crear y no está en trial', () => {
    const e = resolveEntitlement({ status: 'active', current_period_end: enDias(20) }, AHORA);

    expect(e.canCreate).toBe(true);
    expect(e.isTrialing).toBe(false);
    expect(e.trialDaysLeft).toBeNull();
  });

  // Stripe renueva `current_period_end` en cada cobro. Que esté vencido con
  // status 'active' significa que el webhook de renovación no llegó, no que el
  // usuario deba dinero: el error se resuelve a favor de quien paga.
  it('activa con período vencido: sigue pudiendo crear', () => {
    const e = resolveEntitlement({ status: 'active', current_period_end: enDias(-3) }, AHORA);

    expect(e.canCreate).toBe(true);
  });

  it('pago fallido: no puede crear, con motivo payment_failed', () => {
    const e = resolveEntitlement({ status: 'past_due', current_period_end: enDias(2) }, AHORA);

    expect(e.canCreate).toBe(false);
    expect(e.reason).toBe('payment_failed');
  });

  it('impagada: no puede crear, con motivo payment_failed', () => {
    expect(resolveEntitlement({ status: 'unpaid' }, AHORA).reason).toBe('payment_failed');
  });

  it('cancelada: no puede crear, con motivo canceled', () => {
    const e = resolveEntitlement({ status: 'canceled', current_period_end: enDias(-1) }, AHORA);

    expect(e.canCreate).toBe(false);
    expect(e.reason).toBe('canceled');
  });

  // Pasa si el alta quedó a medias. No se autoriza gasto y se distingue del
  // resto para poder detectarlo en Sentry.
  it('sin fila de suscripción: no puede crear', () => {
    expect(resolveEntitlement(null, AHORA).canCreate).toBe(false);
    expect(resolveEntitlement(null, AHORA).reason).toBe('no_subscription');
  });
});

describe('getEntitlement', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  function mockSub(result: { data: unknown; error?: { message: string } | null }) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: result.data, error: result.error ?? null }));
    mockSupabaseClient.from.mockReturnValue(chain);
  }

  it('lee la suscripción de la organización', async () => {
    mockSub({ data: { status: 'trialing', current_period_end: enDias(5) } });

    const e = await getEntitlement('org-1', AHORA);

    expect(e.canCreate).toBe(true);
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('kefy_subscriptions');
  });

  // Falla cerrado, igual que los créditos: sin poder verificar la suscripción
  // no se autoriza gasto.
  it('lanza si la base de datos falla', async () => {
    mockSub({ data: null, error: { message: 'connection refused' } });

    await expect(getEntitlement('org-1', AHORA)).rejects.toThrow(/suscripción/i);
  });
});

describe('requireActiveSubscription', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  function mockSub(data: unknown) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
    mockSupabaseClient.from.mockReturnValue(chain);
  }

  it('devuelve null si la cuenta puede crear', async () => {
    mockSub({ status: 'active', current_period_end: enDias(10) });

    expect(await requireActiveSubscription('org-1', 'es', AHORA)).toBeNull();
  });

  // 402 y no 429: el usuario no ha excedido nada, le falta pagar, y la UI debe
  // llevarlo a planes en lugar de pedirle que reintente.
  it('devuelve 402 con el motivo si no puede crear', async () => {
    mockSub({ status: 'trialing', current_period_end: enDias(-1) });

    const res = await requireActiveSubscription('org-1', 'es', AHORA);

    expect(res?.status).toBe(402);
    const body = await res!.json();
    expect(body.subscriptionRequired).toBe(true);
    expect(body.reason).toBe('trial_expired');
  });

  it('traduce el mensaje al idioma pedido', async () => {
    mockSub({ status: 'trialing', current_period_end: enDias(-1) });

    const res = await requireActiveSubscription('org-1', 'en', AHORA);
    const body = await res!.json();

    expect(body.error).toMatch(/free month/i);
  });

  it('responde 503 si no se puede verificar la suscripción', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }));
    mockSupabaseClient.from.mockReturnValue(chain);

    const res = await requireActiveSubscription('org-1', 'es', AHORA);

    expect(res?.status).toBe(503);
  });
});

describe('blockMessage', () => {
  it('el mensaje de trial vencido aclara que no se pierde nada', () => {
    expect(blockMessage('trial_expired', 'es')).toMatch(/sigue disponible/i);
    expect(blockMessage('trial_expired', 'en')).toMatch(/still there/i);
  });

  it('hay mensaje para cada motivo en ambos idiomas', () => {
    for (const reason of ['trial_expired', 'payment_failed', 'canceled', 'no_subscription'] as const) {
      expect(blockMessage(reason, 'es').length).toBeGreaterThan(10);
      expect(blockMessage(reason, 'en').length).toBeGreaterThan(10);
    }
  });
});
