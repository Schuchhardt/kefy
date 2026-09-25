import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  fakeRpc, resetQuotaState, quotaState, creditsSpent, refundCount,
  resetSubscriptionState, subscriptionState, fakeEntitlement,
  assistantConsumedCount, assistantRefundCount,
} from '../helpers/quota';

const mockSupabaseClient = { rpc: fakeRpc, from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/subscription')>();
  return { ...actual, getEntitlement: async () => fakeEntitlement() };
});

import { guardAiRequest, checkAiSpend } from '@/lib/ai-guard';
import { PLAN_CREDITS, CREDIT_COSTS, PLAN_ASSISTANT_MESSAGES } from '@/lib/usage';
import { assistantRule } from '@/lib/rate-limit';
import type { JWTPayload } from '@/types/auth';

const auth: JWTPayload = { userId: 'user-1', orgId: 'org-1', role: 'owner', plan: 'starter' };

function req() {
  return new NextRequest('http://localhost:3099/api/content/generate', { method: 'POST' });
}

describe('guardAiRequest', () => {
  beforeEach(() => {
    resetQuotaState();
    resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('deja pasar con el trial vigente y créditos disponibles', async () => {
    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });
    expect(guard.blocked).toBeNull();
  });

  it('deja pasar con una suscripción activa', async () => {
    subscriptionState.status = 'active';

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });
    expect(guard.blocked).toBeNull();
  });

  // ─── Suscripción ────────────────────────────────────────────────────────────

  // 402 y no 429: al usuario no le falta cuota, le falta pagar. La UI debe
  // llevarlo a planes en vez de pedirle que reintente.
  it('bloquea con 402 cuando el mes gratis terminó', async () => {
    subscriptionState.daysLeft = -1;

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });

    expect(guard.blocked?.status).toBe(402);
    const body = await guard.blocked!.json();
    expect(body.subscriptionRequired).toBe(true);
    expect(body.reason).toBe('trial_expired');
  });

  it('bloquea con 402 cuando el pago falló', async () => {
    subscriptionState.status = 'past_due';

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });

    expect(guard.blocked?.status).toBe(402);
    expect((await guard.blocked!.json()).reason).toBe('payment_failed');
  });

  // La suscripción se comprueba primero: una cuenta que no puede crear no debe
  // gastar créditos que quizá pague después.
  it('una cuenta bloqueada no consume créditos ni toca el rate limit', async () => {
    subscriptionState.daysLeft = -1;

    await guardAiRequest(req(), { auth, operation: 'video', route: 'test' });

    expect(quotaState.calls).toHaveLength(0);
  });

  // ─── Rate limit ─────────────────────────────────────────────────────────────

  it('bloquea con 429 cuando se supera el rate limit', async () => {
    quotaState.rateLimited = true;

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });

    expect(guard.blocked?.status).toBe(429);
    const body = await guard.blocked!.json();
    // Un rate limit se reintenta; unos créditos agotados no.
    expect(body.creditsExhausted).toBeUndefined();
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('no consume créditos si el rate limit ya bloqueó', async () => {
    quotaState.rateLimited = true;

    await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });

    expect(quotaState.calls.some((c) => c.fn === 'kefy_credits_consume')).toBe(false);
  });

  // ─── Créditos ───────────────────────────────────────────────────────────────

  it('bloquea con 429 y marca creditsExhausted al agotarse los créditos', async () => {
    quotaState.quotaAllowed = false;

    const guard = await guardAiRequest(req(), { auth, operation: 'image', route: 'test' });

    expect(guard.blocked?.status).toBe(429);
    const body = await guard.blocked!.json();
    expect(body.creditsExhausted).toBe(true);
    expect(body.operation).toBe('image');
    expect(body.limit).toBe(PLAN_CREDITS.starter);
  });

  it('descuenta el peso de la operación, no una unidad', async () => {
    await guardAiRequest(req(), { auth, operation: 'video', route: 'test' });

    expect(creditsSpent()).toBe(CREDIT_COSTS.video);
  });

  it('usa el tope de créditos del plan del usuario', async () => {
    await guardAiRequest(req(), { auth: { ...auth, plan: 'pro' }, operation: 'text', route: 'test' });

    const consume = quotaState.calls.find((c) => c.fn === 'kefy_credits_consume');
    expect(consume?.args.p_limit).toBe(PLAN_CREDITS.pro);
  });

  // Sin poder verificar el saldo no se autoriza gasto, pero un 503 dice
  // «reintenta» en vez de «mejora tu plan»: no es culpa del usuario.
  it('responde 503 si los créditos no se pueden verificar', async () => {
    quotaState.dbError = true;

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });

    expect(guard.blocked?.status).toBe(503);
  });

  // ─── Reembolso ──────────────────────────────────────────────────────────────

  it('el refund devuelve lo que costó la operación', async () => {
    const guard = await guardAiRequest(req(), { auth, operation: 'video', route: 'test' });
    expect(guard.blocked).toBeNull();

    await guard.refund();

    const refund = quotaState.calls.find((c) => c.fn === 'kefy_credits_refund');
    expect(refund?.args.p_amount).toBe(CREDIT_COSTS.video);
  });

  it('el refund de una petición bloqueada no devuelve nada', async () => {
    quotaState.quotaAllowed = false;

    const guard = await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });
    await guard.refund();

    // Nada que devolver: el consumo nunca llegó a aplicarse.
    expect(refundCount()).toBe(0);
  });

  // ─── Aislamiento y traducción ───────────────────────────────────────────────

  it('separa el rate limit por organización', async () => {
    await guardAiRequest(req(), { auth, operation: 'text', route: 'test' });
    await guardAiRequest(req(), {
      auth: { ...auth, orgId: 'org-2' }, operation: 'text', route: 'test',
    });

    const buckets = quotaState.calls
      .filter((c) => c.fn === 'kefy_rate_limit_hit')
      .map((c) => c.args.p_bucket);

    expect(buckets).toEqual(['ai:org:org-1', 'ai:org:org-2']);
  });

  it('traduce el mensaje de bloqueo al idioma pedido', async () => {
    quotaState.rateLimited = true;

    const guard = await guardAiRequest(req(), {
      auth, operation: 'text', route: 'test', language: 'en',
    });

    expect((await guard.blocked!.json()).error).toMatch(/too many/i);
  });
});

// ─── Mensajes al asistente ('assistant_message') ──────────────────────────────
//
// Chatear con el asistente no gasta créditos de IA: cada mensaje descuenta de
// una cuota mensual aparte. La guardia sigue siendo la misma (suscripción →
// rate limit → cuota), solo cambia el paso 3.

describe('guardAiRequest con assistant_message', () => {
  beforeEach(() => {
    resetQuotaState();
    resetSubscriptionState();
    vi.resetAllMocks();
  });

  const opts = { auth, operation: 'assistant_message' as const, route: 'test', rateRule: assistantRule(auth.orgId) };

  it('descuenta un mensaje de la cuota del asistente y ningún crédito', async () => {
    const guard = await guardAiRequest(req(), opts);

    expect(guard.blocked).toBeNull();
    expect(assistantConsumedCount()).toBe(1);
    expect(quotaState.calls.some((c) => c.fn === 'kefy_credits_consume')).toBe(false);
  });

  it('usa el tope de mensajes del plan', async () => {
    await guardAiRequest(req(), { ...opts, auth: { ...auth, plan: 'business' } });

    const consume = quotaState.calls.find((c) => c.fn === 'kefy_assistant_consume');
    expect(consume?.args.p_limit).toBe(PLAN_ASSISTANT_MESSAGES.business);
    expect(consume?.args.p_org_id).toBe(auth.orgId);
  });

  it('usa la regla de rate limit del asistente, no la de generación', async () => {
    await guardAiRequest(req(), opts);

    const hit = quotaState.calls.find((c) => c.fn === 'kefy_rate_limit_hit');
    expect(hit?.args.p_bucket).toBe(`assistant:org:${auth.orgId}`);
  });

  it('429 con assistantQuotaExhausted (no creditsExhausted) al agotar la cuota', async () => {
    quotaState.assistantQuotaAllowed = false;

    const guard = await guardAiRequest(req(), opts);

    expect(guard.blocked?.status).toBe(429);
    const body = await guard.blocked!.json();
    expect(body.assistantQuotaExhausted).toBe(true);
    expect(body.creditsExhausted).toBeUndefined();
    expect(body.retryAfter).toBeUndefined();
    expect(body.limit).toBe(PLAN_ASSISTANT_MESSAGES.starter);
  });

  it('una cuenta sin suscripción no consume mensajes', async () => {
    subscriptionState.daysLeft = -1;

    const guard = await guardAiRequest(req(), opts);

    expect(guard.blocked?.status).toBe(402);
    expect(assistantConsumedCount()).toBe(0);
  });

  it('un rate limit no consume mensajes, y su mensaje habla de mensajes', async () => {
    quotaState.rateLimited = true;

    const guard = await guardAiRequest(req(), { ...opts, language: 'en' });

    expect(guard.blocked?.status).toBe(429);
    expect((await guard.blocked!.json()).error).toMatch(/messages/i);
    expect(assistantConsumedCount()).toBe(0);
  });

  it('503 si la cuota no se puede verificar (falla cerrado)', async () => {
    quotaState.dbError = true;

    const guard = await guardAiRequest(req(), opts);

    expect(guard.blocked?.status).toBe(503);
  });

  it('el refund devuelve el mensaje, no créditos', async () => {
    const guard = await guardAiRequest(req(), opts);
    await guard.refund();

    expect(assistantRefundCount()).toBe(1);
    expect(refundCount()).toBe(0);
    expect(quotaState.assistantUsed).toBe(0);
  });
});

describe('checkAiSpend', () => {
  beforeEach(() => {
    resetQuotaState();
    resetSubscriptionState();
    vi.resetAllMocks();
  });

  it('devuelve el cuerpo y las cabeceras del rate limit sin construir un Response', async () => {
    quotaState.rateLimited = true;

    const r = await checkAiSpend(auth, { operation: 'text', route: 'test' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(429);
    expect(r.body.retryAfter).toBeGreaterThan(0);
    expect(r.headers?.['Retry-After']).toBeDefined();
  });

  it('para las operaciones de créditos sigue cobrando créditos', async () => {
    const r = await checkAiSpend(auth, { operation: 'image', route: 'test' });

    expect(r.ok).toBe(true);
    expect(creditsSpent()).toBe(CREDIT_COSTS.image);
    expect(assistantConsumedCount()).toBe(0);
  });
});
