import type { Page, Route } from '@playwright/test';
import { test, expect } from './fixtures/auth';
import { MOCK_ORG_ID, MOCK_USER } from './fixtures/api-mocks';

// ─── Estrategia de contenido: recomendadas y personalizadas ─────────────────
//
// /brand/strategy tiene dos pestañas: las recomendadas del catálogo (objetivo
// × industria) y las personalizadas de la org. Los enlaces del asistente la
// abren con ?objective=&industry= o ?custom=<id>. El backend de estrategias se
// simula en memoria para comprobar qué manda la página.

const OBJ_SALES = '11111111-1111-4111-8111-111111111111';
const OBJ_COMMUNITY = '11111111-1111-4111-8111-222222222222';
const IND_FOOD = '33333333-3333-4333-8333-333333333333';
const STRAT_SALES = '44444444-4444-4444-8444-111111111111';
const STRAT_COMMUNITY = '44444444-4444-4444-8444-222222222222';
const CUSTOM_1 = '55555555-5555-4555-8555-111111111111';
const CUSTOM_2 = '55555555-5555-4555-8555-222222222222';

const OBJECTIVES = [
  { id: OBJ_SALES, slug: 'ventas', name_es: 'Ventas', name_en: 'Sales', desc_es: 'Vender más', desc_en: 'Sell more', icon: '💰' },
  { id: OBJ_COMMUNITY, slug: 'comunidad', name_es: 'Comunidad', name_en: 'Community', desc_es: 'Crear comunidad', desc_en: 'Build community', icon: '🤝' },
];
const INDUSTRIES = [{ id: IND_FOOD, slug: 'food', name_es: 'Gastronomía', name_en: 'Food', icon: '🍽', desc_es: '' }];

function catalogStrategy(id: string, nameEs: string, nameEn: string) {
  return {
    id,
    framework_slug: id,
    framework_name_es: nameEs,
    framework_name_en: nameEn,
    framework_desc_es: `Descripción de ${nameEs}`,
    framework_desc_en: `Description of ${nameEn}`,
    kpi_primary_es: 'Guardados', kpi_primary_en: 'Saves',
    kpi_secondary_es: 'Alcance', kpi_secondary_en: 'Reach',
    interaction_layers: [],
    cta_mechanic_es: 'Comenta PRECIO', cta_mechanic_en: 'Comment PRICE',
  };
}

const RECOMMENDATIONS: Record<string, { strategy: unknown; templates: unknown[] }> = {
  [OBJ_SALES]: {
    strategy: catalogStrategy(STRAT_SALES, 'Embudo de ventas', 'Sales funnel'),
    templates: [
      { id: 't1', week_num: 1, post_num: 1, format: 'carrusel', channel_hint: 'instagram', topic_es: 'Mitos del café', topic_en: 'Coffee myths', copy_structure_es: 'Gancho + 5 mitos', copy_structure_en: 'Hook + 5 myths', goal_es: 'Guardados', goal_en: 'Saves' },
      { id: 't2', week_num: 2, post_num: 1, format: 'reel', channel_hint: 'email', topic_es: 'Detrás de la barra', topic_en: 'Behind the bar', copy_structure_es: '', copy_structure_en: '', goal_es: 'Alcance', goal_en: 'Reach' },
    ],
  },
  [OBJ_COMMUNITY]: {
    strategy: catalogStrategy(STRAT_COMMUNITY, 'Club de fans', 'Fan club'),
    templates: [
      { id: 't3', week_num: 1, post_num: 1, format: 'post', channel_hint: 'instagram', topic_es: 'Pregunta a la comunidad', topic_en: 'Ask the community', copy_structure_es: '', copy_structure_en: '', goal_es: 'Comentarios', goal_en: 'Comments' },
    ],
  },
};

interface CustomRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  objective_id: string | null;
  based_on_strategy_id: string | null;
  kpi_primary: string | null;
  kpi_secondary: string | null;
  cta_mechanic: string | null;
  calendar: { week: number; format: string; channel: string; topic: string; angle?: string | null; goal?: string | null }[];
  created_by: string | null;
  created_via: 'ui' | 'chat' | 'api' | 'mcp';
  updated_via: 'ui' | 'chat' | 'api' | 'mcp';
  created_at: string;
  updated_at: string;
}

function customRow(over: Partial<CustomRow> = {}): CustomRow {
  return {
    id: CUSTOM_1,
    org_id: MOCK_ORG_ID,
    name: 'Temporada de verano',
    description: 'Contenido fresco para el verano.',
    objective_id: OBJ_SALES,
    based_on_strategy_id: null,
    kpi_primary: 'Reservas',
    kpi_secondary: 'Mensajes',
    cta_mechanic: 'Escribe VERANO por DM',
    calendar: [
      { week: 1, format: 'reel', channel: 'tiktok', topic: 'Receta de limonada', angle: 'Paso a paso', goal: 'Guardados' },
      { week: 2, format: 'story', channel: 'general', topic: 'Encuesta de sabores', angle: null, goal: null },
    ],
    created_by: 'u1',
    created_via: 'chat',
    updated_via: 'chat',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-21T10:00:00Z',
    ...over,
  };
}

interface Selection {
  objective_id: string | null;
  industry_id: string | null;
  strategy_id: string | null;
  custom_strategy_id: string | null;
  custom_notes: string | null;
}

/** Backend de estrategias en memoria. `forbidWrites` imita a un miembro (403). */
async function mockStrategies(
  page: Page,
  opts: { customs?: CustomRow[]; selection?: Partial<Selection>; forbidWrites?: boolean } = {},
) {
  const state = {
    customs: [...(opts.customs ?? [])],
    selection: {
      objective_id: OBJ_SALES, industry_id: IND_FOOD, strategy_id: STRAT_SALES,
      custom_strategy_id: null, custom_notes: null, ...opts.selection,
    } as Selection,
    posts: [] as Record<string, unknown>[],
    postQueries: [] as string[],
    patches: [] as { id: string; body: Record<string, unknown> }[],
    orgPatches: [] as Record<string, unknown>[],
    deletes: [] as string[],
    seq: 0,
  };

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(/\/api\/strategies(\/[^?]*)?(\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === '/api/strategies' && method === 'GET') {
      return json(route, 200, { objectives: OBJECTIVES, industries: INDUSTRIES });
    }
    if (path === '/api/strategies/recommend') {
      const rec = RECOMMENDATIONS[url.searchParams.get('objective_id') ?? ''];
      return json(route, 200, rec ? { ...rec, is_fallback: false } : { strategy: null, templates: [] });
    }
    if (path === '/api/strategies/org') {
      if (method === 'GET') return json(route, 200, { selection: state.selection });
      if (opts.forbidWrites) return json(route, 403, { error: 'Forbidden' });
      const body = req.postDataJSON() as Partial<Selection>;
      state.orgPatches.push(body);
      const choosesCatalog = body.strategy_id !== undefined || body.objective_id !== undefined;
      state.selection = {
        ...state.selection,
        ...body,
        custom_strategy_id: body.custom_strategy_id !== undefined
          ? body.custom_strategy_id
          : choosesCatalog ? null : state.selection.custom_strategy_id,
      };
      return json(route, 200, { selection: state.selection });
    }
    if (path === '/api/strategies/custom') {
      if (method === 'GET') return json(route, 200, { strategies: state.customs });
      if (opts.forbidWrites) return json(route, 403, { error: 'Forbidden' });
      const { activate, ...fields } = req.postDataJSON() as Record<string, unknown>;
      state.posts.push({ activate, ...fields });
      state.postQueries.push(url.search);
      state.seq += 1;
      const row = customRow({
        ...(fields as Partial<CustomRow>),
        id: `66666666-6666-4666-8666-00000000000${state.seq}`,
        created_via: 'ui', updated_via: 'ui',
        updated_at: '2026-09-25T10:00:00Z',
      });
      state.customs = [row, ...state.customs];
      if (activate) state.selection = { ...state.selection, custom_strategy_id: row.id };
      return json(route, 201, { strategy: row, selection: activate ? state.selection : null });
    }
    const id = path.split('/')[4];
    if (id && path.startsWith('/api/strategies/custom/')) {
      if (method === 'GET') {
        const row = state.customs.find((c) => c.id === id);
        return row ? json(route, 200, { strategy: row }) : json(route, 404, { error: 'Not found' });
      }
      if (opts.forbidWrites) return json(route, 403, { error: 'Forbidden' });
      if (method === 'DELETE') {
        state.deletes.push(id);
        state.customs = state.customs.filter((c) => c.id !== id);
        if (state.selection.custom_strategy_id === id) state.selection = { ...state.selection, custom_strategy_id: null };
        return route.fulfill({ status: 204, body: '' });
      }
      if (method === 'PATCH') {
        const { activate, ...fields } = req.postDataJSON() as Record<string, unknown>;
        state.patches.push({ id, body: { activate, ...fields } });
        state.customs = state.customs.map((c) => (c.id === id ? { ...c, ...(fields as Partial<CustomRow>) } : c));
        const row = state.customs.find((c) => c.id === id)!;
        if (activate) state.selection = { ...state.selection, custom_strategy_id: id };
        return json(route, 200, { strategy: row, selection: activate ? state.selection : null });
      }
    }
    return json(route, 404, { error: 'not mocked' });
  });

  return state;
}

async function signToken(role: 'owner' | 'admin' | 'member') {
  const { SignJWT } = await import('jose');
  const key = new TextEncoder().encode(process.env.JWT_SECRET ?? 'test-secret');
  return new SignJWT({ userId: 'u1', orgId: 'org-1', role, plan: 'pro' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(key);
}

/** Sesión con el rol dado: cookie firmada + /api/auth/me coherente. */
async function actAs(page: Page, baseURL: string, role: 'owner' | 'admin' | 'member') {
  await page.context().addCookies([{
    name: 'kefy_access', value: await signToken(role), url: `${baseURL}/`,
    httpOnly: true, secure: false, sameSite: 'Lax',
  }]);
  await page.route('/api/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: MOCK_USER,
      org: { id: MOCK_ORG_ID, name: 'Test Org', slug: 'test-org', plan: 'pro' },
      role,
      plan: 'pro',
      subscription: { canCreate: true, status: 'active', isTrialing: false, periodEnd: null, trialDaysLeft: null, reason: null },
    }),
  }));
}

const STRATEGY_URL = '/es/dashboard/brand/strategy';
const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const customList = (page: Page) => page.getByRole('list', { name: 'Estrategias personalizadas' });

test.describe('Estrategia de contenido', () => {
  test.beforeEach(async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
  });

  test('?objective=&industry= previsualiza ese par y guardarlo lo activa', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page);
    await page.goto(`${STRATEGY_URL}?objective=${OBJ_COMMUNITY}&industry=${IND_FOOD}`);

    await expect(page.getByText('Club de fans', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(tab(page, /Recomendadas/)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Comunidad/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Ventas/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Pregunta a la comunidad')).toBeVisible();

    // No es la guardada: el botón permite guardarla.
    const save = page.getByRole('button', { name: 'Guardar estrategia' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole('button', { name: '✓ Estrategia guardada' })).toBeVisible();
    expect(state.orgPatches).toEqual([{ objective_id: OBJ_COMMUNITY, industry_id: IND_FOOD, strategy_id: STRAT_COMMUNITY }]);
  });

  test('sin parámetros muestra la guardada con la etiqueta Activa', async ({ authenticatedPage: page }) => {
    await mockStrategies(page);
    await page.goto(STRATEGY_URL);

    await expect(page.getByText('Embudo de ventas', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(tab(page, /Recomendadas/)).toContainText('Activa');
    await expect(tab(page, /Personalizadas/)).not.toContainText('Activa');
    await expect(page.getByRole('button', { name: '✓ Estrategia guardada' })).toBeDisabled();
  });

  test('?custom=<id> abre la pestaña de personalizadas con esa estrategia', async ({ authenticatedPage: page }) => {
    await mockStrategies(page, {
      customs: [customRow({ id: CUSTOM_2, name: 'Otra estrategia', created_via: 'ui' }), customRow()],
    });
    await page.goto(`${STRATEGY_URL}?custom=${CUSTOM_1}`);

    await expect(tab(page, /Personalizadas/)).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    const detail = page.getByTestId('custom-strategy-detail');
    await expect(detail.getByRole('heading', { name: 'Temporada de verano' })).toBeVisible();
    await expect(detail.getByText('Receta de limonada')).toBeVisible();
    await expect(detail.getByText('Escribe VERANO por DM')).toBeVisible();
    await expect(detail.getByText('Reservas')).toBeVisible();

    const card = customList(page).getByRole('button', { name: /Temporada de verano/ });
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText('Creada por el asistente');
    await expect(card).toContainText('2 semanas · 2 piezas');
    await expect(customList(page).getByRole('button', { name: /Otra estrategia/ })).not.toContainText('Creada por el asistente');

    // «Generar» de una pieza lleva al generador con el formato y el canal.
    await detail.getByRole('row', { name: /Receta de limonada/ }).getByRole('button', { name: '❆ Generar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/content\/create\?.*type=reel/, { timeout: 20000 });
    expect(new URL(page.url()).searchParams.get('channel')).toBe('tiktok');
    expect(new URL(page.url()).searchParams.get('topic')).toBe('Receta de limonada');
  });

  test('crear una estrategia personalizada', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page);
    await page.goto(STRATEGY_URL);
    await tab(page, /Personalizadas/).click();
    await expect(page.getByText('Todavía no tienes estrategias personalizadas', { exact: false })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: '+ Nueva estrategia' }).click();
    const form = page.getByRole('form', { name: 'Nueva estrategia personalizada' });

    // Sin nombre ni tema no se envía.
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Ponle un nombre a la estrategia.');
    expect(state.posts).toHaveLength(0);

    await form.getByLabel('Nombre *').fill('Lanzamiento de otoño');
    await form.getByLabel('Objetivo (opcional)').selectOption(OBJ_SALES);
    await form.getByLabel('Enfoque').fill('Contar la historia del nuevo menú.');
    await form.getByLabel('KPI principal').fill('Reservas');
    const rows = form.getByTestId('custom-calendar-row');
    await rows.nth(0).getByLabel('Tema *').fill('Presentamos el menú');
    await rows.nth(0).getByLabel('Formato').selectOption('carousel');
    await form.getByRole('button', { name: '+ Añadir pieza' }).click();
    await rows.nth(1).getByLabel('Semana').selectOption('2');
    await rows.nth(1).getByLabel('Canal').selectOption('tiktok');
    await rows.nth(1).getByLabel('Tema *').fill('Cocina en vivo');
    await rows.nth(1).getByLabel('Ángulo').fill('Plano cenital');

    await form.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect(form).toHaveCount(0);
    expect(state.posts).toEqual([{
      activate: false,
      name: 'Lanzamiento de otoño',
      description: 'Contar la historia del nuevo menú.',
      objective_id: OBJ_SALES,
      based_on_strategy_id: null,
      kpi_primary: 'Reservas',
      kpi_secondary: null,
      cta_mechanic: null,
      calendar: [
        { week: 1, format: 'carousel', channel: 'general', topic: 'Presentamos el menú', angle: null, goal: null },
        { week: 2, format: 'post', channel: 'tiktok', topic: 'Cocina en vivo', angle: 'Plano cenital', goal: null },
      ],
    }]);

    const card = customList(page).getByRole('button', { name: /Lanzamiento de otoño/ });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('Activa');
    await expect(page.getByTestId('custom-strategy-detail').getByText('Cocina en vivo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activar' })).toBeVisible();
  });

  test('«Guardar y activar» envía activate:true y marca la estrategia como activa', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page);
    await page.goto(STRATEGY_URL);
    await tab(page, /Personalizadas/).click();
    await page.getByRole('button', { name: '+ Nueva estrategia' }).click({ timeout: 20000 });

    const form = page.getByRole('form', { name: 'Nueva estrategia personalizada' });
    await form.getByLabel('Nombre *').fill('Plan de fidelidad');
    await form.getByLabel('Tema *').fill('Tarjeta de puntos');
    await form.getByRole('button', { name: 'Guardar y activar' }).click();

    await expect(form).toHaveCount(0);
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0].activate).toBe(true);

    await expect(customList(page).getByRole('button', { name: /Plan de fidelidad/ })).toContainText('Activa');
    await expect(tab(page, /Personalizadas/)).toContainText('Activa');
    await expect(tab(page, /Recomendadas/)).not.toContainText('Activa');
    await expect(page.getByRole('button', { name: 'Activar' })).toHaveCount(0);

    // En la pestaña de recomendadas se avisa de que manda la personalizada.
    await tab(page, /Recomendadas/).click();
    await expect(page.getByText('Ahora mismo tienes activa una estrategia personalizada', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar estrategia' })).toBeEnabled();
  });

  test('activar una existente y editarla', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page, { customs: [customRow()] });
    await page.goto(`${STRATEGY_URL}?custom=${CUSTOM_1}`);

    await page.getByRole('button', { name: 'Activar' }).click({ timeout: 20000 });
    await expect(page.getByRole('status').filter({ hasText: '✓ Estrategia activada' })).toBeVisible();
    expect(state.orgPatches).toEqual([{ custom_strategy_id: CUSTOM_1 }]);
    await expect(tab(page, /Personalizadas/)).toContainText('Activa');

    await page.getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: 'Editar estrategia' });
    await expect(form.getByLabel('Nombre *')).toHaveValue('Temporada de verano');
    await expect(form.getByTestId('custom-calendar-row')).toHaveCount(2);
    await form.getByLabel('Nombre *').fill('Verano 2027');
    await form.getByRole('button', { name: 'Quitar pieza 2' }).click();
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect(form).toHaveCount(0);
    expect(state.patches).toHaveLength(1);
    expect(state.patches[0].id).toBe(CUSTOM_1);
    expect(state.patches[0].body).toMatchObject({ name: 'Verano 2027', activate: false });
    expect((state.patches[0].body.calendar as unknown[]).length).toBe(1);
    await expect(page.getByTestId('custom-strategy-detail').getByRole('heading', { name: 'Verano 2027' })).toBeVisible();
  });

  test('eliminar pide confirmación en la página y envía DELETE', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page, {
      customs: [customRow()],
      selection: { custom_strategy_id: CUSTOM_1 },
    });
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs += 1; void d.dismiss(); });

    await page.goto(STRATEGY_URL);
    // La activa es propia: se abre directamente en esa pestaña.
    await expect(tab(page, /Personalizadas/)).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await expect(tab(page, /Personalizadas/)).toContainText('Activa');

    await page.getByRole('button', { name: 'Eliminar' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Eliminar' });
    await expect(confirm).toContainText('¿Eliminar «Temporada de verano»?');
    await expect(confirm).toContainText('Kefy volverá a usar la recomendada');

    // Cancelar no borra.
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toHaveCount(0);
    expect(state.deletes).toEqual([]);

    await page.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, eliminar' }).click();

    await expect(page.getByText('Estrategia eliminada')).toBeVisible();
    expect(state.deletes).toEqual([CUSTOM_1]);
    expect(dialogs).toBe(0);
    await expect(page.getByText('Todavía no tienes estrategias personalizadas', { exact: false })).toBeVisible();
    await expect(tab(page, /Personalizadas/)).not.toContainText('Activa');
  });

  test('«Personalizar esta estrategia» copia la recomendada en el editor', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page);
    await page.goto(STRATEGY_URL);

    await page.getByRole('button', { name: '✎ Personalizar esta estrategia' }).click({ timeout: 20000 });
    await expect(tab(page, /Personalizadas/)).toHaveAttribute('aria-selected', 'true');
    const form = page.getByRole('form', { name: 'Nueva estrategia personalizada' });
    await expect(form.getByLabel('Nombre *')).toHaveValue('Embudo de ventas (personalizada)');
    await expect(form.getByText('Basada en la estrategia recomendada')).toBeVisible();
    const rows = form.getByTestId('custom-calendar-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).getByLabel('Formato')).toHaveValue('carousel');
    await expect(rows.nth(1).getByLabel('Formato')).toHaveValue('reel');
    await expect(rows.nth(1).getByLabel('Canal')).toHaveValue('general');

    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(state.posts[0]).toMatchObject({
      name: 'Embudo de ventas (personalizada)',
      based_on_strategy_id: STRAT_SALES,
      objective_id: OBJ_SALES,
      kpi_primary: 'Guardados',
      cta_mechanic: 'Comenta PRECIO',
    });
  });

  test('«Pedirle una al asistente» abre el asistente con el mensaje escrito', async ({ authenticatedPage: page }) => {
    await mockStrategies(page);
    let chats = 0;
    await page.route('/api/assistant/chat', (route) => { chats += 1; return route.abort(); });
    await page.goto(STRATEGY_URL);
    await tab(page, /Personalizadas/).click({ timeout: 20000 });
    await page.getByRole('button', { name: '❆ Pedirle una al asistente' }).click();

    const dialog = page.getByRole('dialog', { name: 'Asistente Kefy' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Pídele algo al asistente…' }))
      .toHaveValue('Créame una estrategia personalizada para mi marca');
    expect(chats).toBe(0);
  });

  test('si el servidor responde 403 se explica quién puede crear', async ({ authenticatedPage: page }) => {
    const state = await mockStrategies(page, { forbidWrites: true });
    await page.goto(STRATEGY_URL);
    await tab(page, /Personalizadas/).click({ timeout: 20000 });
    await page.getByRole('button', { name: '+ Nueva estrategia' }).click();
    const form = page.getByRole('form', { name: 'Nueva estrategia personalizada' });
    await form.getByLabel('Nombre *').fill('X');
    await form.getByLabel('Tema *').fill('Y');
    await form.getByRole('button', { name: 'Guardar y activar' }).click();

    await expect(form.getByRole('alert')).toContainText('Solo el dueño o un administrador');
    expect(state.posts).toHaveLength(0);
    await expect(form).toBeVisible();
  });
});

test.describe('Estrategia de contenido — miembro', () => {
  test('un miembro puede ver pero no crear, editar ni activar', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'member');
    await mockStrategies(page, { customs: [customRow()], forbidWrites: true });
    await page.goto(`${STRATEGY_URL}?custom=${CUSTOM_1}`);

    const detail = page.getByTestId('custom-strategy-detail');
    await expect(detail.getByRole('heading', { name: 'Temporada de verano' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Solo el dueño o un administrador de la organización puede crear, editar o activar estrategias.')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Nueva estrategia' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    // En las recomendadas, guardar responde 403 y se explica.
    await tab(page, /Recomendadas/).click();
    await expect(page.getByRole('button', { name: '✎ Personalizar esta estrategia' })).toHaveCount(0);
    await page.getByRole('button', { name: /Comunidad/ }).click();
    await page.getByRole('button', { name: 'Guardar estrategia' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Solo el dueño o un administrador' })).toBeVisible();
  });
});

test.describe('Estrategia de contenido — inglés', () => {
  test('/en muestra los textos en inglés', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const state = await mockStrategies(page, { customs: [customRow()] });
    await page.goto(`/en/dashboard/brand/strategy?custom=${CUSTOM_1}`);

    await expect(page.getByRole('tab', { name: /Custom/ })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await expect(page.getByRole('tab', { name: /Recommended/ })).toContainText('Active');
    await expect(page.getByRole('heading', { name: 'Your custom strategies' })).toBeVisible();
    const card = page.getByRole('list', { name: 'Custom strategies' }).getByRole('button', { name: /Temporada de verano/ });
    await expect(card).toContainText('2 weeks · 2 pieces');
    await expect(card).toContainText('Created by the assistant');
    await expect(page.getByTestId('custom-strategy-detail').getByText('W1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Delete “Temporada de verano”?');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: '+ New strategy' }).click();
    const form = page.getByRole('form', { name: 'New custom strategy' });
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('Give the strategy a name.');
    await expect(form.getByRole('alert')).toContainText('Every piece needs a topic.');
    expect(state.posts).toHaveLength(0);

    // Los errores de la API se piden en inglés.
    await form.getByLabel('Name *').fill('Autumn');
    await form.getByLabel('Topic *').fill('New menu');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(state.posts).toHaveLength(1);
    expect(state.postQueries).toEqual(['?lang=en']);
  });
});
