// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../../helpers/quota';
import { IDS, AUTH, seedWorkspace, apiCtx } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { serviceContext } from '@/lib/services/context';
import {
  CUSTOM_STRATEGY_LIMITS, createCustomStrategy, deleteCustomStrategy, getCustomStrategy, listCustomStrategies,
  updateCustomStrategy,
} from '@/lib/services/custom-strategy';
import { getOrgStrategy, getStrategyIdeas, loadStrategyContext, setOrgStrategy } from '@/lib/services/strategy';
import { executeTool } from '@/lib/assistant/registry';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { chatToolContext } from '@/lib/assistant/context';
import type { ToolContext } from '@/lib/assistant/types';

// Estrategias propias de la organización: aislamiento entre orgs, cómo
// conviven con la del catálogo en kefy_org_strategies, que las ideas de
// contenido las usen, y las herramientas del asistente que las crean.

const OBJECTIVE = IDS.uuid(300);
const INDUSTRY = IDS.uuid(301);
const CATALOG = IDS.uuid(302);
const OTHER_CUSTOM = IDS.uuid(310);

const ctx = (over: Partial<Parameters<typeof serviceContext>[3]> = {}, auth = AUTH) =>
  serviceContext(auth, IDS.BRAND, 'es', { brandScope: 'org', source: 'route', ...over });


const VALID = {
  name: 'Café de barrio',
  description: 'Contenido cercano que lleva a visitar el local.',
  objective_id: OBJECTIVE,
  kpi_primary: 'Visitas al local',
  cta_mechanic: 'Cupón por DM',
  calendar: [
    { week: 2, format: 'carousel', channel: 'instagram', topic: 'Cómo tostamos', goal: 'Guardados' },
    { week: 1, format: 'post', topic: 'Presentamos el blend de otoño', angle: 'Historia del origen' },
    { week: 1, format: 'reel', channel: 'tiktok', topic: 'Un día en la barra' },
  ],
};

function chat(tainted = false): ToolContext {
  return chatToolContext({
    auth: AUTH, brandId: IDS.BRAND, language: 'es', conversationId: IDS.uuid(100), turnId: IDS.uuid(101), tainted,
  });
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  vi.clearAllMocks();
  seedWorkspace(db);
  ensureToolsRegistered();
  db.seed('kefy_content_objectives', [{ id: OBJECTIVE, slug: 'ventas', name_es: 'Ventas', name_en: 'Sales', sort_order: 1 }]);
  db.seed('kefy_content_industries', [{ id: INDUSTRY, slug: 'gastronomia', name_es: 'Gastronomía', name_en: 'Food', sort_order: 1 }]);
  db.seed('kefy_content_strategies', [{
    id: CATALOG, objective_id: OBJECTIVE, industry_id: INDUSTRY,
    framework_name_es: 'Embudo local', framework_name_en: 'Local funnel', kpi_primary_es: 'Reservas', kpi_primary_en: 'Bookings',
  }]);
  db.seed('kefy_strategy_templates', [{
    id: IDS.uuid(303), strategy_id: CATALOG, week_num: 1, post_num: 1, format: 'post', channel_hint: 'general',
    topic_es: 'Tema del catálogo', topic_en: 'Catalog topic', sort_order: 0,
  }]);
  db.seed('kefy_custom_strategies', [{
    id: OTHER_CUSTOM, org_id: IDS.OTHER_ORG, name: 'Secreta de otra org', calendar: [{ week: 1, format: 'post', channel: 'general', topic: 'Ajeno' }],
    created_via: 'ui', updated_via: 'ui', kpi_primary: null, updated_at: '2026-09-01T00:00:00Z',
  }]);
});

describe('servicio de estrategias propias', () => {
  it('crea la estrategia en la org del usuario, con el calendario ordenado por semana', async () => {
    const s = await createCustomStrategy(ctx(), VALID);
    expect(s).toMatchObject({ org_id: IDS.ORG, name: 'Café de barrio', created_via: 'ui', created_by: IDS.USER });
    expect(s.calendar.map((c) => c.topic)).toEqual([
      'Presentamos el blend de otoño', 'Un día en la barra', 'Cómo tostamos',
    ]);
    expect(s.calendar[0].channel).toBe('general');
  });

  it('rechaza con 422 una estrategia sin calendario o con un formato que no existe', async () => {
    await expect(createCustomStrategy(ctx(), { ...VALID, calendar: [] })).rejects.toMatchObject({ status: 422 });
    await expect(createCustomStrategy(ctx(), {
      ...VALID, calendar: [{ week: 1, format: 'infografía', topic: 'x' }],
    })).rejects.toMatchObject({ status: 422 });
    await expect(createCustomStrategy(ctx(), { ...VALID, calendar: [{ week: 13, format: 'post', topic: 'x' }] }))
      .rejects.toMatchObject({ status: 422 });
    expect(db.rows('kefy_custom_strategies')).toHaveLength(1);
  });

  it('rechaza un objetivo que no está en el catálogo', async () => {
    await expect(createCustomStrategy(ctx(), { ...VALID, objective_id: IDS.uuid(999) }))
      .rejects.toMatchObject({ status: 422 });
  });

  it('no deja crear más del máximo por organización', async () => {
    db.seed('kefy_custom_strategies', Array.from({ length: CUSTOM_STRATEGY_LIMITS.perOrg }, (_, i) => ({
      id: IDS.uuid(400 + i), org_id: IDS.ORG, name: `S${i}`, calendar: [], created_via: 'ui', updated_via: 'ui',
    })));
    await expect(createCustomStrategy(ctx(), VALID)).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });

  it('la estrategia de otra org no existe para esta: leer, editar y borrar dan 404', async () => {
    await expect(getCustomStrategy(ctx(), OTHER_CUSTOM)).rejects.toMatchObject({ status: 404 });
    await expect(updateCustomStrategy(ctx(), OTHER_CUSTOM, { name: 'Robada' })).rejects.toMatchObject({ status: 404 });
    await expect(deleteCustomStrategy(ctx(), OTHER_CUSTOM)).rejects.toMatchObject({ status: 404 });
    expect(db.find('kefy_custom_strategies', (r) => r.id === OTHER_CUSTOM)?.name).toBe('Secreta de otra org');
    expect(await listCustomStrategies(ctx())).toEqual([]);
  });

  it('una edición desde la API deja updated_via = api', async () => {
    const s = await createCustomStrategy(ctx(), VALID);
    const updated = await updateCustomStrategy(ctx({ source: 'api' }), s.id, { kpi_primary: 'Ventas' });
    expect(updated).toMatchObject({ created_via: 'ui', updated_via: 'api', kpi_primary: 'Ventas' });
  });
});

describe('selección de la org con estrategia propia', () => {
  it('activa una propia y la de otra org da 404 sin tocar la selección', async () => {
    const s = await createCustomStrategy(ctx(), VALID);
    await expect(setOrgStrategy(ctx(), { custom_strategy_id: OTHER_CUSTOM })).rejects.toMatchObject({ status: 404 });
    expect(db.rows('kefy_org_strategies')).toHaveLength(0);

    const { selection } = await setOrgStrategy(ctx(), { custom_strategy_id: s.id });
    expect(selection.custom_strategy_id).toBe(s.id);

    const { names } = await getOrgStrategy(ctx());
    expect(names).toMatchObject({ framework: 'Café de barrio', custom: true });
  });

  it('cambiar solo la industria (página Mercado) conserva la propia; elegir del catálogo la desactiva', async () => {
    const s = await createCustomStrategy(ctx(), VALID);
    await setOrgStrategy(ctx(), { custom_strategy_id: s.id });

    const { selection: afterIndustry } = await setOrgStrategy(ctx(), { industry_id: INDUSTRY });
    expect(afterIndustry.custom_strategy_id).toBe(s.id);

    const { selection: afterCatalog } = await setOrgStrategy(ctx(), {
      objective_id: OBJECTIVE, industry_id: INDUSTRY, strategy_id: CATALOG,
    });
    expect(afterCatalog).toMatchObject({ custom_strategy_id: null, strategy_id: CATALOG });
  });
});

describe('las ideas de contenido usan la estrategia propia activa', () => {
  it('get_content_ideas sale del calendario de la propia, no del catálogo', async () => {
    const s = await createCustomStrategy(ctx(), VALID);
    await setOrgStrategy(ctx(), { objective_id: OBJECTIVE, industry_id: INDUSTRY, strategy_id: CATALOG });
    await setOrgStrategy(ctx(), { custom_strategy_id: s.id });

    const ideas = await getStrategyIdeas(ctx());
    expect(ideas).toMatchObject({ source: 'strategy', strategy: { framework_name: 'Café de barrio', kpi_primary: 'Visitas al local' } });
    if (!('strategy' in ideas)) throw new Error('sin estrategia');
    expect(ideas.ideas.map((i) => i.topic)).toContain('Presentamos el blend de otoño');
    expect(ideas.ideas.map((i) => i.topic)).not.toContain('Tema del catálogo');
    expect(ideas.ideas.find((i) => i.topic === 'Un día en la barra')?.content_type).toBe('reel');
  });

  it('el contexto de generación nunca lee la estrategia propia de otra org', async () => {
    const strategyCtx = await loadStrategyContext({
      db: db.client,
      orgStrategy: { strategy_id: null, custom_strategy_id: OTHER_CUSTOM, created_at: null },
      orgId: IDS.ORG,
      brandKitIndustry: null,
      lang: 'es',
    });
    expect(strategyCtx).toBeNull();
  });
});

describe('herramientas del asistente', () => {
  it('save_custom_strategy en el chat pide confirmación con nombre, piezas y temas; al confirmar crea y activa', async () => {
    const pending = await executeTool('save_custom_strategy', { ...VALID, activate: true }, chat());
    expect(pending.ok).toBe('pending');
    if (pending.ok !== 'pending') return;
    expect(pending.summary).toContain('Café de barrio');
    expect(pending.summary).toContain('activarla');
    expect(pending.preview).toMatchObject({ name: 'Café de barrio', posts: 3, weeks: 2, activate: true });
    expect(db.rows('kefy_custom_strategies')).toHaveLength(1);

    // Como el agente al confirmar: el hash que se guardó con la acción pendiente.
    const action = db.find('kefy_assistant_actions', (r) => r.id === pending.actionId)!;
    const snapshotHash = (action.result as { snapshot_hash?: string }).snapshot_hash ?? null;
    const done = await executeTool('save_custom_strategy', { ...VALID, activate: true }, chat(), {
      confirmed: true, claimedActionId: pending.actionId, expectedSnapshotHash: snapshotHash,
    });
    expect(done.ok).toBe(true);
    if (done.ok !== true) return;
    const created = db.rows('kefy_custom_strategies').find((r) => r.org_id === IDS.ORG)!;
    expect(created).toMatchObject({ created_via: 'chat', name: 'Café de barrio' });
    expect(done.links?.[0].href).toBe(`/es/dashboard/brand/strategy?custom=${created.id}`);
    expect(done.dataChanged).toEqual(['strategy']);
    expect(db.find('kefy_org_strategies', (r) => r.org_id === IDS.ORG)?.custom_strategy_id).toBe(created.id);
  });

  it('save_custom_strategy sin nombre ni calendario (crear) falla con 422', async () => {
    const r = await executeTool('save_custom_strategy', { kpi_primary: 'x' }, apiCtx({ brandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { status: 422 } });
  });

  it('un miembro no puede guardar ni activar estrategias', async () => {
    const r = await executeTool('save_custom_strategy', VALID, apiCtx({ role: 'member', brandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('set_active_strategy con la propia de otra org falla y no cambia nada', async () => {
    const r = await executeTool('set_active_strategy', { custom_strategy_id: OTHER_CUSTOM }, apiCtx({ brandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { status: 404 } });
    expect(db.rows('kefy_org_strategies')).toHaveLength(0);
  });

  it('una estrategia escrita por la API contamina el turno del chat al listarla', async () => {
    const created = await executeTool('save_custom_strategy', VALID, apiCtx({ brandId: IDS.BRAND }));
    expect(created.ok).toBe(true);

    const c = chat();
    const r = await executeTool('get_strategy_catalog', {}, c);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.tainted).toBe(true);
    expect(c.turn?.tainted).toBe(true);
    const listed = (r.data as { custom_strategies: Array<{ name: string }> }).custom_strategies;
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toContain('<untrusted_content source="strategy">');
  });

  it('una creada en el chat no contamina y no se envuelve', async () => {
    await createCustomStrategy(ctx({ source: 'chat' }), VALID);
    const r = await executeTool('get_strategy_catalog', {}, chat());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.tainted).toBeUndefined();
    expect((r.data as { custom_strategies: Array<{ name: string }> }).custom_strategies[0].name).toBe('Café de barrio');
  });

  it('el link de preview_strategy abre la página con ese objetivo e industria', async () => {
    const r = await executeTool('preview_strategy', { objective_id: OBJECTIVE, industry_id: INDUSTRY }, chat());
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.links?.[0].href).toBe(`/es/dashboard/brand/strategy?objective=${OBJECTIVE}&industry=${INDUSTRY}`);
  });

  it('preview_strategy sin par ni custom_strategy_id da 422', async () => {
    const r = await executeTool('preview_strategy', { objective_id: OBJECTIVE }, chat());
    expect(r).toMatchObject({ ok: false, error: { status: 422 } });
  });

  it('una API key atada a una marca no puede crear estrategias (son de toda la org)', async () => {
    const r = await executeTool('save_custom_strategy', VALID, apiCtx({ boundBrandId: IDS.BRAND }));
    expect(r).toMatchObject({ ok: false, error: { code: 'bound_key_org_write' } });
  });
});
