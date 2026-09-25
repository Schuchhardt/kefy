// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import {
  claimPendingAction, rejectAction, expirePendingActions, completeAction, insertIdempotentAction,
  reclaimIdempotentAction, isAbandonedRun, IDEMPOTENCY_LEASE_MS,
} from '@/lib/assistant/audit';

// Las confirmaciones del chat: confirmar o rechazar es un UPDATE condicionado
// al estado, así que dos clics, dos pestañas u otro usuario no pueden ejecutar
// la misma acción dos veces.

const who = { orgId: IDS.ORG, userId: IDS.USER };
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function seedPending(over: Record<string, unknown> = {}) {
  return db.seed('kefy_assistant_actions', [{
    org_id: IDS.ORG, user_id: IDS.USER, tool_name: 'publish_content', source: 'chat', kind: 'publish',
    status: 'pending_confirmation', tool_use_id: 'toolu_1', expires_at: inMinutes(10), ...over,
  }])[0];
}

beforeEach(() => { db.reset(); });

describe('claimPendingAction', () => {
  it('reclama una acción pendiente: pasa a running con decided_at', async () => {
    const a = seedPending();

    const claimed = await claimPendingAction(a.id as string, who);

    expect(claimed?.id).toBe(a.id);
    expect(db.rows('kefy_assistant_actions')[0]).toMatchObject({ status: 'running' });
    expect(db.rows('kefy_assistant_actions')[0].decided_at).toBeTruthy();
  });

  it('el segundo clic (o la otra pestaña) no obtiene nada', async () => {
    const a = seedPending();

    const [one, two] = await Promise.all([
      claimPendingAction(a.id as string, who),
      claimPendingAction(a.id as string, who),
    ]);

    expect([one, two].filter(Boolean)).toHaveLength(1);
  });

  it('otro usuario de la misma organización no puede confirmarla', async () => {
    const a = seedPending();

    expect(await claimPendingAction(a.id as string, { orgId: IDS.ORG, userId: IDS.USER_2 })).toBeNull();
    expect(db.rows('kefy_assistant_actions')[0].status).toBe('pending_confirmation');
  });

  it('otra organización no puede confirmarla', async () => {
    const a = seedPending();
    expect(await claimPendingAction(a.id as string, { orgId: IDS.OTHER_ORG, userId: IDS.USER })).toBeNull();
  });

  it('una confirmación vencida no se ejecuta: queda expired con su tool_result de error', async () => {
    const a = seedPending({ expires_at: inMinutes(-1) });

    expect(await claimPendingAction(a.id as string, who)).toBeNull();

    const row = db.rows('kefy_assistant_actions')[0];
    expect(row.status).toBe('expired');
    expect(row.tool_result).toEqual({
      type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'Confirmation expired.',
    });
  });

  it('una acción ya decidida no se vuelve a reclamar', async () => {
    const a = seedPending({ status: 'rejected' });
    expect(await claimPendingAction(a.id as string, who)).toBeNull();
  });
});

describe('rejectAction', () => {
  it('rechaza y deja listo el tool_result para reanudar el turno', async () => {
    const a = seedPending();

    const r = await rejectAction(a.id as string, who, 'user');

    expect(r?.status).toBe('rejected');
    expect(r?.tool_result).toEqual({
      type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'The user declined this action.',
    });
  });

  it("'superseded' explica al modelo que el usuario escribió otro mensaje", async () => {
    const a = seedPending();
    const r = await rejectAction(a.id as string, who, 'superseded');
    expect(String(r?.tool_result?.content)).toMatch(/new message/);
  });

  it('solo su dueño la rechaza, y solo si sigue pendiente', async () => {
    const a = seedPending();

    expect(await rejectAction(a.id as string, { orgId: IDS.ORG, userId: IDS.USER_2 }, 'user')).toBeNull();
    expect(await rejectAction(a.id as string, { orgId: IDS.OTHER_ORG, userId: IDS.USER }, 'user')).toBeNull();

    await claimPendingAction(a.id as string, who);
    expect(await rejectAction(a.id as string, who, 'user')).toBeNull();
    expect(db.rows('kefy_assistant_actions')[0].status).toBe('running');
  });
});

describe('expirePendingActions', () => {
  it('solo expira las vencidas del usuario y la organización indicados', async () => {
    seedPending({ expires_at: inMinutes(-5) });
    seedPending({ expires_at: inMinutes(5) });
    seedPending({ expires_at: inMinutes(-5), user_id: IDS.USER_2 });
    seedPending({ expires_at: inMinutes(-5), org_id: IDS.OTHER_ORG });

    expect(await expirePendingActions(IDS.ORG, IDS.USER)).toBe(1);

    const statuses = db.rows('kefy_assistant_actions').map((r) => r.status);
    expect(statuses).toEqual(['expired', 'pending_confirmation', 'pending_confirmation', 'pending_confirmation']);
  });

  it('no lanza si la base falla', async () => {
    db.failNext('kefy_assistant_actions', 'select');
    await expect(expirePendingActions(IDS.ORG)).resolves.toBe(0);
  });
});

describe('completeAction', () => {
  it('no toca acciones de otra organización', async () => {
    const a = seedPending({ status: 'running' });

    await completeAction(a.id as string, 'succeeded', { ok: true }, undefined, IDS.OTHER_ORG);

    expect(db.rows('kefy_assistant_actions')[0].status).toBe('running');
  });

  it('no lanza si la auditoría falla: la acción ya ocurrió', async () => {
    db.failNext('kefy_assistant_actions', 'update');
    await expect(completeAction('x', 'failed', null, 'err')).resolves.toBeUndefined();
  });
});

describe('insertIdempotentAction', () => {
  const row = {
    org_id: IDS.ORG, tool_name: 'create_post', source: 'api' as const, kind: 'write' as const, status: 'running' as const,
    api_key_id: IDS.KEY, idempotency_key: 'k1', idempotency_hash: 'h1',
  };

  it('la primera vez inserta', async () => {
    const r = await insertIdempotentAction(row);
    expect(r.existing).toBeUndefined();
    expect(r.row.id).toBeTruthy();
  });

  it('una clave repetida devuelve la fila existente (violación 23505)', async () => {
    const first = await insertIdempotentAction(row);
    const second = await insertIdempotentAction({ ...row, idempotency_hash: 'h2' });

    expect(second.existing?.id).toBe(first.row.id);
    expect(second.existing?.idempotency_hash).toBe('h1');
    expect(db.rows('kefy_assistant_actions')).toHaveLength(1);
  });

  it('cualquier otro error de la base lanza (sin auditoría no se ejecuta)', async () => {
    db.failNext('kefy_assistant_actions', 'insert');
    await expect(insertIdempotentAction(row)).rejects.toThrow();
  });
});

describe('isAbandonedRun', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const created_at = '2026-09-23T11:59:00Z';

  it('running con el plazo vencido: abandonada', () => {
    expect(isAbandonedRun({ status: 'running', created_at, expires_at: '2026-09-23T11:59:59Z' }, now)).toBe(true);
  });

  it('running dentro del plazo, o en otro estado: no', () => {
    expect(isAbandonedRun({ status: 'running', created_at, expires_at: '2026-09-23T12:05:00Z' }, now)).toBe(false);
    expect(isAbandonedRun({ status: 'failed', created_at, expires_at: '2026-09-23T11:00:00Z' }, now)).toBe(false);
  });

  it('sin expires_at usa created_at + IDEMPOTENCY_LEASE_MS', () => {
    expect(isAbandonedRun({ status: 'running', created_at, expires_at: null }, now)).toBe(false);
    expect(isAbandonedRun({ status: 'running', created_at, expires_at: null }, Date.parse(created_at) + IDEMPOTENCY_LEASE_MS)).toBe(true);
  });
});

describe('reclaimIdempotentAction', () => {
  const row = {
    org_id: IDS.ORG, tool_name: 'create_post', source: 'api' as const, kind: 'write' as const, status: 'failed' as const,
    api_key_id: IDS.KEY, idempotency_key: 'k1', idempotency_hash: 'h1', result: { ok: false }, error: 'No credits',
    completed_at: '2026-09-23T11:00:00Z',
  };

  it('vuelve a poner la fila en running, limpia el resultado y renueva el plazo', async () => {
    const { row: ex } = await insertIdempotentAction(row);

    expect(await reclaimIdempotentAction(ex)).toBe(true);

    const after = db.rows('kefy_assistant_actions')[0];
    expect(after).toMatchObject({ id: ex.id, status: 'running', result: null, error: null, completed_at: null });
    expect(Date.parse(after.expires_at as string)).toBeGreaterThan(Date.now());
  });

  it('de dos reintentos simultáneos solo uno la obtiene', async () => {
    const { row: ex } = await insertIdempotentAction(row);

    expect(await reclaimIdempotentAction(ex)).toBe(true);
    expect(await reclaimIdempotentAction(ex)).toBe(false);
  });

  it('un error de la base lanza', async () => {
    const { row: ex } = await insertIdempotentAction(row);
    db.failNext('kefy_assistant_actions', 'update');
    await expect(reclaimIdempotentAction(ex)).rejects.toThrow();
  });
});
