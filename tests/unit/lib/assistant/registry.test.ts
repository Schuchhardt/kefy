// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { z } from 'zod';
import { createFakeDb } from '../../helpers/fake-db';
import { resetQuotaState, quotaState, resetSubscriptionState, subscriptionState } from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, seedSubscriptions, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import {
  __resetRegistryForTests, defineTool, registerTools, executeTool, listTools, toolJsonSchema,
  CONFIRM_CREDIT_THRESHOLD,
} from '@/lib/assistant/registry';
import { CONFIRMATION_TTL_MINUTES, IDEMPOTENCY_LEASE_MS } from '@/lib/assistant/audit';
import { chatToolContext } from '@/lib/assistant/context';
import { ServiceError } from '@/lib/services/errors';
import { reportError } from '@/lib/observability';
import type { ToolContext } from '@/lib/assistant/types';

// ─── Herramientas de prueba ──────────────────────────────────────────────────
//
// Herramientas mínimas que ejercitan cada regla del registro sin depender de
// los servicios reales. `calls` registra cada ejecución del handler: si una
// regla bloquea, el handler no puede haber corrido.

const calls: Array<{ name: string; input: unknown; ctx: ToolContext }> = [];
const record = (name: string) => async (ctx: ToolContext, input: unknown) => {
  calls.push({ name, input, ctx: { ...ctx } });
  return { data: { ran: name, input } };
};

/** Error que lanza t_flaky mientras no sea null. */
const flakyState: { error: { code: 'credits_exhausted' | 'rate_limited' | 'provider_error'; status: number } | null } = {
  error: null,
};

/** Lo que t_snap «publicaría»: puede cambiar entre la tarjeta y el clic. */
const snapState = { body: 'texto original' };

const testTools = [
  defineTool({
    name: 't_snap', kind: 'publish', description: 'publish with snapshot', confirm: 'always',
    input: z.object({ item: z.string() }),
    describe: async () => ({ text: snapState.body }),
    snapshot: async () => ({ body: snapState.body }),
    handler: record('t_snap'),
  }),
  defineTool({
    name: 't_read', kind: 'read', description: 'read', confirm: 'never',
    input: z.object({ q: z.string().optional() }),
    handler: record('t_read'),
  }),
  defineTool({
    name: 't_write', kind: 'write', description: 'write', confirm: 'never',
    input: z.object({ text: z.string().min(1), n: z.number().optional(), tags: z.array(z.string()).optional() }),
    handler: record('t_write'),
  }),
  defineTool({
    name: 't_publish', kind: 'publish', description: 'publish', confirm: 'always',
    title: { es: 'Publicar prueba', en: 'Test publish' },
    input: z.object({ text: z.string() }),
    describe: async (_ctx, input) => ({ text: input.text, accounts: ['@acme'] }),
    handler: record('t_publish'),
  }),
  defineTool({
    name: 't_owner_only', kind: 'write', description: 'owner', confirm: 'never', roles: ['owner'],
    input: z.object({}),
    handler: record('t_owner_only'),
  }),
  defineTool({
    name: 't_org_wide', kind: 'write', description: 'org', confirm: 'never', orgWide: true,
    input: z.object({}),
    handler: record('t_org_wide'),
  }),
  defineTool({
    name: 't_expensive', kind: 'write', description: 'expensive', confirm: 'never',
    input: z.object({ credits: z.number() }),
    estimateCredits: (input) => input.credits,
    handler: record('t_expensive'),
  }),
  defineTool({
    name: 't_chat_only', kind: 'read', description: 'chat only', confirm: 'never', sources: ['chat'],
    input: z.object({}),
    handler: record('t_chat_only'),
  }),
  defineTool({
    name: 't_taint', kind: 'read', description: 'taint', confirm: 'never', taints: 'always',
    input: z.object({}),
    handler: record('t_taint'),
  }),
  defineTool({
    name: 't_service_error', kind: 'write', description: 'service error', confirm: 'never',
    input: z.object({}),
    handler: async () => {
      throw new ServiceError('credits_exhausted', 429, 'No credits', { error: 'No credits', creditsExhausted: true }, { 'X-Test': '1' });
    },
  }),
  defineTool({
    name: 't_final_error', kind: 'write', description: 'final service error', confirm: 'never',
    input: z.object({}),
    handler: async () => {
      throw new ServiceError('not_found', 404, 'Content not found');
    },
  }),
  defineTool({
    name: 't_flaky', kind: 'write', description: 'fails while flakyState.error is set', confirm: 'never',
    input: z.object({}),
    handler: async (ctx, input) => {
      const e = flakyState.error;
      if (e) throw new ServiceError(e.code, e.status, e.code);
      return record('t_flaky')(ctx, input);
    },
  }),
  defineTool({
    name: 't_crash', kind: 'write', description: 'crash', confirm: 'never',
    input: z.object({}),
    handler: async () => { throw new Error('boom: secret internals'); },
  }),
];

beforeAll(() => {
  __resetRegistryForTests();
  registerTools(testTools);
});

beforeEach(() => {
  db.reset();
  calls.length = 0;
  snapState.body = 'texto original';
  flakyState.error = null;
  resetQuotaState();
  resetSubscriptionState();
  vi.mocked(reportError).mockClear();
  seedWorkspace(db);
});

function chatCtx(over: { tainted?: boolean } = {}): ToolContext {
  return chatToolContext({
    auth: AUTH, brandId: IDS.BRAND, language: 'es',
    conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted: over.tainted ?? false,
  });
}

const actions = () => db.rows('kefy_assistant_actions');

// ─── Registro ────────────────────────────────────────────────────────────────

describe('registerTools', () => {
  it('rechaza un nombre repetido', () => {
    expect(() => registerTools([testTools[0]])).toThrow(/duplicada/);
  });
});

describe('listTools', () => {
  it('en el chat se ven todas las del chat, ordenadas por nombre', () => {
    const names = listTools(chatCtx()).map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(names).toContain('t_chat_only');
    expect(names).toContain('t_publish');
  });

  it('una key solo ve las herramientas de sus scopes y nunca las exclusivas del chat', () => {
    const names = listTools(apiCtx({ scopes: ['read'] })).map((t) => t.name);
    expect(names).toContain('t_read');
    expect(names).not.toContain('t_write');
    expect(names).not.toContain('t_publish');
    expect(names).not.toContain('t_chat_only');
  });

  it('un miembro no ve las herramientas reservadas a otros roles', () => {
    const names = listTools(apiCtx({ role: 'member' })).map((t) => t.name);
    expect(names).not.toContain('t_owner_only');
  });

  it('una key atada a una marca no ve las de toda la organización', () => {
    expect(listTools(apiCtx({ boundBrandId: IDS.BRAND })).map((t) => t.name)).not.toContain('t_org_wide');
    expect(listTools(apiCtx()).map((t) => t.name)).toContain('t_org_wide');
  });
});

describe('toolJsonSchema', () => {
  const def = testTools[1];

  it('fuera del chat y sin marca atada añade brand_id', () => {
    const s = toolJsonSchema(def, { source: 'api', boundBrandId: null });
    expect((s.properties as Record<string, unknown>).brand_id).toBeDefined();
    expect(s.type).toBe('object');
  });

  it('en el chat o con una key atada no lo añade', () => {
    expect((toolJsonSchema(def, { source: 'chat' }).properties as Record<string, unknown>).brand_id).toBeUndefined();
    expect((toolJsonSchema(def, { source: 'mcp', boundBrandId: IDS.BRAND }).properties as Record<string, unknown>).brand_id)
      .toBeUndefined();
  });
});

// ─── Orden de las comprobaciones ─────────────────────────────────────────────

describe('executeTool: herramienta y fuente', () => {
  it('404 para una herramienta desconocida', async () => {
    const r = await executeTool('no_existe', {}, chatCtx());
    expect(r).toMatchObject({ ok: false, error: { code: 'not_found', status: 404 } });
  });

  it('una herramienta exclusiva del chat es desconocida por la API', async () => {
    const r = await executeTool('t_chat_only', {}, apiCtx({ brandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(calls).toHaveLength(0);
  });
});

describe('executeTool: marca (API / MCP)', () => {
  it('con varias marcas y sin brand_id → 400 brand_required con la lista de marcas activas', async () => {
    const r = await executeTool('t_read', {}, apiCtx());

    expect(r.ok).toBe(false);
    if (r.ok !== false) return;
    expect(r.error.code).toBe('brand_required');
    expect(r.error.status).toBe(400);
    const brands = (r.error.body?.brands as Array<{ id: string }>).map((b) => b.id).sort();
    // Nunca la archivada ni la de otra organización.
    expect(brands).toEqual([IDS.BRAND, IDS.BRAND_2].sort());
    expect(calls).toHaveLength(0);
  });

  it('brand_id de otra organización → 404, sin revelar que existe', async () => {
    const r = await executeTool('t_read', { brand_id: IDS.OTHER_BRAND }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { code: 'not_found', status: 404 } });
    expect(calls).toHaveLength(0);
  });

  it('una marca archivada no se puede elegir', async () => {
    const r = await executeTool('t_read', { brand_id: IDS.ARCHIVED_BRAND }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { status: 404 } });
  });

  it('key atada a una marca + brand_id distinto → 403', async () => {
    const r = await executeTool('t_read', { brand_id: IDS.BRAND_2 }, apiCtx({ boundBrandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden', status: 403 } });
    expect(calls).toHaveLength(0);
  });

  it('brand_id que no es texto → 422', async () => {
    const r = await executeTool('t_read', { brand_id: 42 }, apiCtx());
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input', status: 422 } });
  });

  it('con brand_id válido corre sobre esa marca y brand_id no llega al handler', async () => {
    const r = await executeTool('t_read', { brand_id: IDS.BRAND_2, q: 'x' }, apiCtx());

    expect(r.ok).toBe(true);
    expect(calls[0].ctx.brandId).toBe(IDS.BRAND_2);
    expect(calls[0].input).toEqual({ q: 'x' });
  });

  it('con una sola marca activa la elige sola', async () => {
    db.rows('kefy_brands').find((b) => b.id === IDS.BRAND_2)!.archived = true;

    const r = await executeTool('t_read', {}, apiCtx());

    expect(r.ok).toBe(true);
    expect(calls[0].ctx.brandId).toBe(IDS.BRAND);
  });

  it('en el chat se ignora cualquier brand_id: vale la marca de la sesión', async () => {
    const r = await executeTool('t_read', { brand_id: IDS.OTHER_BRAND }, chatCtx());
    // brand_id no está en el esquema: zod lo descarta y la herramienta usa la marca del contexto.
    expect(r.ok).toBe(true);
    expect(calls[0].ctx.brandId).toBe(IDS.BRAND);
  });
});

describe('executeTool: scopes → validación → rol → orgWide', () => {
  it('los scopes van antes que la validación: sin scope no se filtra el esquema', async () => {
    const r = await executeTool('t_write', { text: '' }, apiCtx({ brandId: IDS.BRAND, scopes: ['read'] }));
    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied', status: 403 } });
    if (r.ok === false) expect(r.error.body?.issues).toBeUndefined();
  });

  it('con el scope, una entrada inválida → 422 con issues', async () => {
    const r = await executeTool('t_write', { text: '' }, apiCtx({ brandId: IDS.BRAND, scopes: ['write'] }));
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_input', status: 422 } });
    if (r.ok === false) expect(r.error.body?.issues).toBeDefined();
  });

  it('sin el scope de la herramienta → 403 scope_denied', async () => {
    const r = await executeTool('t_write', { text: 'hola' }, apiCtx({ brandId: IDS.BRAND, scopes: ['read'] }));
    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied', status: 403 } });
    expect(calls).toHaveLength(0);
  });

  it('el scope va antes que el rol', async () => {
    const r = await executeTool('t_owner_only', {}, apiCtx({ brandId: IDS.BRAND, scopes: ['read'], role: 'member' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'scope_denied' } });
  });

  it('rol insuficiente → 403 forbidden (también en el chat)', async () => {
    const ctx = chatCtx();
    ctx.role = 'member';
    const r = await executeTool('t_owner_only', {}, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden', status: 403 } });
    expect(calls).toHaveLength(0);
  });

  it('una key atada a una marca no puede escribir datos de toda la organización', async () => {
    const r = await executeTool('t_org_wide', {}, apiCtx({ boundBrandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { code: 'bound_key_org_write', status: 403 } });
    expect(calls).toHaveLength(0);
  });

  it('el chat tiene todos los scopes', async () => {
    const r = await executeTool('t_write', { text: 'hola' }, chatCtx());
    expect(r.ok).toBe(true);
  });
});

describe('executeTool: suscripción y rate limit de publicación', () => {
  it('con el trial vencido una escritura → 402 con el cuerpo de la guardia', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);

    const r = await executeTool('t_write', { text: 'hola' }, chatCtx());

    expect(r).toMatchObject({ ok: false, error: { code: 'subscription_required', status: 402 } });
    if (r.ok === false) expect(r.error.body).toMatchObject({ subscriptionRequired: true, reason: 'trial_expired' });
    expect(calls).toHaveLength(0);
    expect(actions()).toHaveLength(0);
  });

  it('con el trial vencido las lecturas siguen funcionando', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);

    const r = await executeTool('t_read', {}, chatCtx());
    expect(r.ok).toBe(true);
  });

  it('la suscripción se comprueba antes de la confirmación: no se crea una tarjeta que no se podría ejecutar', async () => {
    subscriptionState.status = 'canceled';
    seedSubscriptions(db);

    const r = await executeTool('t_publish', { text: 'hola' }, chatCtx());

    expect(r).toMatchObject({ ok: false, error: { status: 402 } });
    expect(actions()).toHaveLength(0);
  });

  it('publicar pasa por el rate limit de publicación de la organización', async () => {
    quotaState.rateLimited = true;

    const r = await executeTool('t_publish', { text: 'hola' }, apiCtx({ brandId: IDS.BRAND }));

    expect(r).toMatchObject({ ok: false, error: { code: 'rate_limited', status: 429 } });
    if (r.ok === false) {
      expect(r.error.headers?.['Retry-After']).toBeDefined();
      expect(r.error.body?.retryAfter).toBeGreaterThan(0);
    }
    const hit = quotaState.calls.find((c) => c.fn === 'kefy_rate_limit_hit');
    expect(hit?.args.p_bucket).toBe(`publish:org:${IDS.ORG}`);
    expect(calls).toHaveLength(0);
  });

  it('las escrituras que no publican no gastan el rate limit de publicación', async () => {
    quotaState.rateLimited = true;
    const r = await executeTool('t_write', { text: 'hola' }, chatCtx());
    expect(r.ok).toBe(true);
    expect(quotaState.calls.some((c) => c.fn === 'kefy_rate_limit_hit')).toBe(false);
  });

  it('una cuenta sin suscripción no llega a tocar el rate limit', async () => {
    subscriptionState.daysLeft = -1;
    seedSubscriptions(db);
    await executeTool('t_publish', { text: 'hola' }, apiCtx({ brandId: IDS.BRAND }));
    expect(quotaState.calls.some((c) => c.fn === 'kefy_rate_limit_hit')).toBe(false);
  });
});

// ─── Confirmación humana (chat) ──────────────────────────────────────────────

describe('executeTool: confirmación en el chat', () => {
  it("confirm 'always' → pending: guarda la tarjeta y no ejecuta nada", async () => {
    const ctx = chatCtx();
    ctx.messageId = IDS.uuid(102);
    const before = Date.now();

    const r = await executeTool('t_publish', { text: 'hola' }, ctx, { toolUseId: 'toolu_1' });

    expect(r.ok).toBe('pending');
    if (r.ok !== 'pending') return;
    expect(r.preview).toEqual({ text: 'hola', accounts: ['@acme'] });
    expect(calls).toHaveLength(0);

    const row = actions()[0];
    expect(row).toMatchObject({
      id: r.actionId,
      status: 'pending_confirmation',
      tool_name: 't_publish',
      tool_use_id: 'toolu_1',
      source: 'chat',
      kind: 'publish',
      org_id: IDS.ORG,
      brand_id: IDS.BRAND,
      user_id: IDS.USER,
      conversation_id: IDS.uuid(100),
      turn_id: IDS.uuid(101),
      message_id: IDS.uuid(102),
      input: { text: 'hola' },
    });
    expect((row.result as Record<string, unknown>).preview).toEqual(r.preview);
    const ttl = Date.parse(String(row.expires_at)) - before;
    expect(ttl).toBeGreaterThan((CONFIRMATION_TTL_MINUTES - 1) * 60_000);
    expect(ttl).toBeLessThanOrEqual(CONFIRMATION_TTL_MINUTES * 60_000 + 1000);
    expect(ctx.turn?.pausedInMessage).toBe(true);
  });

  it('una vez confirmada (claimedActionId) se ejecuta sobre la misma fila', async () => {
    const pending = await executeTool('t_publish', { text: 'hola' }, chatCtx());
    if (pending.ok !== 'pending') throw new Error('se esperaba pending');
    // La ruta reclama la fila antes de ejecutar.
    Object.assign(actions()[0], { status: 'running' });

    const ctx = chatCtx();
    const r = await executeTool('t_publish', { text: 'hola' }, ctx, { confirmed: true, claimedActionId: pending.actionId });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    // El handler ve el id de la acción (base del request_id de Zernio).
    expect(calls[0].ctx.actionId).toBe(pending.actionId);
    expect(actions()).toHaveLength(1);
    expect(actions()[0].status).toBe('succeeded');
    expect(actions()[0].completed_at).toBeTruthy();
  });

  it('guarda el hash de lo que vio la persona y, si no cambió, ejecuta al confirmar', async () => {
    const pending = await executeTool('t_snap', { item: 'x' }, chatCtx());
    if (pending.ok !== 'pending') throw new Error('se esperaba pending');
    const stored = actions()[0].result as { snapshot_hash?: string };
    expect(stored.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    Object.assign(actions()[0], { status: 'running' });

    const r = await executeTool('t_snap', { item: 'x' }, chatCtx(), {
      confirmed: true, claimedActionId: pending.actionId, expectedSnapshotHash: stored.snapshot_hash,
    });

    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['t_snap']);
  });

  it('si el contenido cambió entre la tarjeta y el clic → 409 content_changed, sin ejecutar', async () => {
    const pending = await executeTool('t_snap', { item: 'x' }, chatCtx());
    if (pending.ok !== 'pending') throw new Error('se esperaba pending');
    const stored = actions()[0].result as { snapshot_hash?: string };
    Object.assign(actions()[0], { status: 'running' });

    // Otra pestaña o una API key con scope write cambia el texto.
    snapState.body = 'texto del atacante https://phish.example';

    const r = await executeTool('t_snap', { item: 'x' }, chatCtx(), {
      confirmed: true, claimedActionId: pending.actionId, expectedSnapshotHash: stored.snapshot_hash,
    });

    expect(r).toMatchObject({ ok: false, error: { code: 'content_changed', status: 409 } });
    expect(calls).toHaveLength(0);
  });

  it('una herramienta con snapshot confirmada sin hash guardado no se ejecuta (falla cerrado)', async () => {
    const r = await executeTool('t_snap', { item: 'x' }, chatCtx(), { confirmed: true, expectedSnapshotHash: null });
    expect(r).toMatchObject({ ok: false, error: { code: 'content_changed', status: 409 } });
    expect(calls).toHaveLength(0);
  });

  it(`una acción de ${CONFIRM_CREDIT_THRESHOLD}+ créditos pide confirmación; una más barata no`, async () => {
    const expensive = await executeTool('t_expensive', { credits: CONFIRM_CREDIT_THRESHOLD }, chatCtx());
    expect(expensive.ok).toBe('pending');
    if (expensive.ok === 'pending') expect(expensive.credits).toBe(CONFIRM_CREDIT_THRESHOLD);

    const cheap = await executeTool('t_expensive', { credits: CONFIRM_CREDIT_THRESHOLD - 1 }, chatCtx());
    expect(cheap.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['t_expensive']);
  });

  it('con contenido no confiable en el historial toda escritura pide confirmación', async () => {
    const r = await executeTool('t_write', { text: 'hola' }, chatCtx({ tainted: true }));
    expect(r.ok).toBe('pending');
    expect(calls).toHaveLength(0);
  });

  it('con contenido no confiable las lecturas siguen sin confirmación', async () => {
    const r = await executeTool('t_read', {}, chatCtx({ tainted: true }));
    expect(r.ok).toBe(true);
  });

  it('una herramienta que trae contenido de terceros contamina el turno: la escritura siguiente pide confirmación', async () => {
    const ctx = chatCtx();

    const read = await executeTool('t_taint', {}, ctx);
    expect(read).toMatchObject({ ok: true, tainted: true });
    expect(ctx.turn?.tainted).toBe(true);

    const write = await executeTool('t_write', { text: 'responder' }, ctx);
    expect(write.ok).toBe('pending');
  });

  it('si otra acción del mismo mensaje espera confirmación, la escritura siguiente también', async () => {
    const ctx = chatCtx();

    const first = await executeTool('t_publish', { text: 'uno' }, ctx);
    const second = await executeTool('t_write', { text: 'dos' }, ctx);

    expect(first.ok).toBe('pending');
    expect(second.ok).toBe('pending');
    expect(actions().filter((a) => a.status === 'pending_confirmation')).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it('fuera del chat no hay confirmación: la API ejecuta directamente', async () => {
    const r = await executeTool('t_publish', { text: 'hola' }, apiCtx({ brandId: IDS.BRAND }));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ status: 'succeeded', source: 'api', api_key_id: IDS.KEY });
  });

  it('las escrituras sin confirmación dejan auditoría (running → succeeded)', async () => {
    const r = await executeTool('t_write', { text: 'hola' }, chatCtx(), { toolUseId: 'toolu_9' });

    expect(r.ok).toBe(true);
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ status: 'succeeded', tool_use_id: 'toolu_9', kind: 'write' });
    expect((actions()[0].result as Record<string, unknown>).ok).toBe(true);
  });

  it('las lecturas no dejan fila de auditoría', async () => {
    await executeTool('t_read', {}, chatCtx());
    expect(actions()).toHaveLength(0);
  });
});

// ─── Idempotencia (API / MCP) ────────────────────────────────────────────────

describe('executeTool: Idempotency-Key', () => {
  const ctx = () => apiCtx({ brandId: IDS.BRAND });

  it('la misma key con la misma entrada devuelve el resultado guardado sin volver a ejecutar', async () => {
    const first = await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    const replay = await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ idempotency_key: 'k1', status: 'succeeded' });
  });

  it('el orden de las claves de la entrada no cambia el hash', async () => {
    await executeTool('t_write', { text: 'hola', n: 1 }, ctx(), { idempotencyKey: 'k1' });
    const replay = await executeTool('t_write', { n: 1, text: 'hola' }, ctx(), { idempotencyKey: 'k1' });

    expect(replay.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('la misma key con otra entrada → 422 idempotency_mismatch', async () => {
    await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    const r = await executeTool('t_write', { text: 'otra cosa' }, ctx(), { idempotencyKey: 'k1' });

    expect(r).toMatchObject({ ok: false, error: { code: 'idempotency_mismatch', status: 422 } });
    expect(calls).toHaveLength(1);
  });

  it('la misma key y el mismo cuerpo con otra marca → 422 idempotency_mismatch (no devuelve lo de la primera)', async () => {
    // Key sin marca atada: brand_id va en el cuerpo y sale antes de validar.
    const first = await executeTool('t_write', { text: 'hola', brand_id: IDS.BRAND }, apiCtx(), { idempotencyKey: 'kb' });
    const other = await executeTool('t_write', { text: 'hola', brand_id: IDS.BRAND_2 }, apiCtx(), { idempotencyKey: 'kb' });

    expect(first.ok).toBe(true);
    expect(other).toMatchObject({ ok: false, error: { code: 'idempotency_mismatch', status: 422 } });
    expect(calls.map((c) => c.ctx.brandId)).toEqual([IDS.BRAND]);
  });

  it('la misma key con otra herramienta también es un mismatch', async () => {
    await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    const r = await executeTool('t_publish', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    expect(r).toMatchObject({ ok: false, error: { code: 'idempotency_mismatch' } });
  });

  it('mientras la primera sigue corriendo → 409 idempotency_in_progress', async () => {
    await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    actions()[0].status = 'running';

    const r = await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });

    expect(r).toMatchObject({ ok: false, error: { code: 'idempotency_in_progress', status: 409 } });
    expect(calls).toHaveLength(1);
  });

  it('un fallo definitivo guardado se repite tal cual, sin reintentar', async () => {
    const first = await executeTool('t_final_error', {}, ctx(), { idempotencyKey: 'k2' });
    const updatesBefore = db.writes('kefy_assistant_actions').length;
    const replay = await executeTool('t_final_error', {}, ctx(), { idempotencyKey: 'k2' });

    expect(first).toMatchObject({ ok: false, error: { code: 'not_found', status: 404 } });
    expect(replay).toEqual(first);
    expect(actions()).toHaveLength(1);
    expect(actions()[0].status).toBe('failed');
    // Solo el intento de insert (23505): la fila no se retoma.
    expect(db.writes('kefy_assistant_actions').length - updatesBefore).toBe(1);
  });

  it.each([
    ['credits_exhausted', 429],
    ['rate_limited', 429],
    ['provider_error', 502],
  ] as const)('un fallo pasajero (%s) no se guarda para siempre: la misma key vuelve a ejecutar', async (code, status) => {
    flakyState.error = { code, status };
    const first = await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k3' });
    expect(first).toMatchObject({ ok: false, error: { code, status } });
    const firstId = actions()[0].id;

    // Pasó el Retry-After / llegaron créditos / volvió el proveedor.
    flakyState.error = null;
    const retry = await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k3' });

    expect(retry.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['t_flaky']);
    // Misma fila (mismo id → mismo request_id en Zernio), ahora con éxito.
    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ id: firstId, status: 'succeeded', error: null });
    expect(calls[0].ctx.actionId).toBe(firstId);

    // Y el éxito sí se guarda.
    await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k3' });
    expect(calls).toHaveLength(1);
  });

  it('una ejecución abandonada en running (plazo vencido) se retoma con la misma key', async () => {
    await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k4' });
    // El proceso murió a mitad: la fila quedó en running con el plazo vencido.
    Object.assign(actions()[0], {
      status: 'running', result: null, completed_at: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const r = await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k4' });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(actions()).toHaveLength(1);
    expect(actions()[0].status).toBe('succeeded');
  });

  it('una fila idempotente nueva se inserta con un plazo en expires_at', async () => {
    flakyState.error = { code: 'provider_error', status: 502 };
    await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k5' });
    const lease = Date.parse(actions()[0].expires_at as string) - Date.now();
    expect(lease).toBeGreaterThan(5 * 60_000);
    expect(lease).toBeLessThanOrEqual(IDEMPOTENCY_LEASE_MS);
  });

  it('si otro reintento retomó la fila primero → 409 idempotency_in_progress', async () => {
    flakyState.error = { code: 'credits_exhausted', status: 429 };
    await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k6' });
    flakyState.error = null;
    // El UPDATE condicionado no encuentra la fila (otro la retomó entre medias).
    const realFrom = db.client.from.bind(db.client);
    const spy = vi.spyOn(db.client, 'from').mockImplementation(((table: string) => {
      const b = realFrom(table);
      if (table === 'kefy_assistant_actions') {
        const origUpdate = b.update.bind(b);
        b.update = (patch: Record<string, unknown>) => {
          if (patch.status === 'running') actions()[0].status = 'running';
          return origUpdate(patch);
        };
      }
      return b;
    }) as typeof db.client.from);

    const r = await executeTool('t_flaky', {}, ctx(), { idempotencyKey: 'k6' });
    spy.mockRestore();

    expect(r).toMatchObject({ ok: false, error: { code: 'idempotency_in_progress', status: 409 } });
    expect(calls).toHaveLength(0);
  });

  it('las keys son por API key: otra key puede usar el mismo valor', async () => {
    await executeTool('t_write', { text: 'hola' }, ctx(), { idempotencyKey: 'k1' });
    const other = await executeTool('t_write', { text: 'otra' }, apiCtx({ brandId: IDS.BRAND, apiKeyId: IDS.uuid(31) }), {
      idempotencyKey: 'k1',
    });
    expect(other.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('en el chat la Idempotency-Key se ignora', async () => {
    await executeTool('t_write', { text: 'hola' }, chatCtx(), { idempotencyKey: 'k1' });
    await executeTool('t_write', { text: 'hola' }, chatCtx(), { idempotencyKey: 'k1' });
    expect(calls).toHaveLength(2);
    expect(actions().every((a) => a.idempotency_key === null)).toBe(true);
  });
});

// ─── Auditoría y errores ─────────────────────────────────────────────────────

describe('executeTool: auditoría y errores', () => {
  it('sin poder registrar la acción no se ejecuta → 503', async () => {
    db.failNext('kefy_assistant_actions', 'insert');

    const r = await executeTool('t_write', { text: 'hola' }, chatCtx());

    expect(r).toMatchObject({ ok: false, error: { code: 'unavailable', status: 503 } });
    expect(calls).toHaveLength(0);
  });

  it('un ServiceError conserva código, estado, cuerpo y cabeceras', async () => {
    const r = await executeTool('t_service_error', {}, chatCtx());

    expect(r).toEqual({
      ok: false,
      error: {
        code: 'credits_exhausted', status: 429, message: 'No credits',
        body: { error: 'No credits', creditsExhausted: true }, headers: { 'X-Test': '1' },
      },
    });
    expect(actions()[0]).toMatchObject({ status: 'failed', error: 'No credits' });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('un error inesperado → 502 genérico (sin detalles internos) y se reporta', async () => {
    const r = await executeTool('t_crash', {}, chatCtx());

    expect(r).toMatchObject({ ok: false, error: { code: 'provider_error', status: 502 } });
    if (r.ok === false) expect(r.error.message).not.toMatch(/secret/);
    expect(reportError).toHaveBeenCalled();
    expect(actions()[0].status).toBe('failed');
  });
});
