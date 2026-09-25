import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';
import { MOCK_BRAND, MOCK_ORG_ID, MOCK_USER, mockApiKey, type MockApiKey } from './fixtures/api-mocks';

// ─── API keys y MCP (Ajustes) ────────────────────────────────────────────────
//
// La sección solo la ven el dueño y los administradores. El rol lo decide
// /api/auth/me (que en los tests está mockeado); el JWT de la cookie se firma
// con el mismo rol para que el proxy y la página cuenten la misma historia.

const SECRET = 'kefy_sk_ab12_s3cr3t-0nly-0nc3-XYZ';

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
    }),
  }));
}

/** Backend de keys en memoria: GET lista, POST crea, DELETE revoca. */
async function mockApiKeys(page: Page, initial: MockApiKey[] = [mockApiKey()]) {
  const state = {
    keys: [...initial],
    posts: [] as Record<string, unknown>[],
    deletes: [] as string[],
    gets: 0,
  };

  await page.route(/\/api\/api-keys(\/[^/?]+)?(\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = url.pathname.split('/')[3];
    const method = req.method();

    if (!id && method === 'GET') {
      state.gets += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ keys: state.keys }) });
    }
    if (!id && method === 'POST') {
      const body = req.postDataJSON() as { name: string; scopes: MockApiKey['scopes']; brand_id?: string; expires_in_days?: number };
      state.posts.push(body);
      const row = mockApiKey({
        id: 'key-new', name: body.name, key_prefix: 'kefy_sk_zz99', scopes: body.scopes,
        brand_id: body.brand_id ?? null,
        expires_at: body.expires_in_days ? new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString() : null,
      });
      state.keys = [row, ...state.keys];
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          key: { id: row.id, name: row.name, prefix: row.key_prefix, scopes: row.scopes, brand_id: row.brand_id, expires_at: row.expires_at, created_at: row.created_at },
          secret: SECRET,
        }),
      });
    }
    if (id && method === 'DELETE') {
      state.deletes.push(id);
      state.keys = state.keys.map((k) => (k.id === id ? { ...k, status: 'revoked' as const, revoked_at: new Date().toISOString() } : k));
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
  });

  return state;
}

/** Portapapeles falso: WebKit no deja conceder permisos de clipboard. */
async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { w.__copied = text; } },
    });
  });
}

test.describe('API keys y MCP en Ajustes', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route('/api/brands', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ brands: [MOCK_BRAND] }),
    }));
  });

  test('el dueño ve la sección y la lista con el prefijo de cada key', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    await mockApiKeys(page, [mockApiKey(), mockApiKey({ id: 'key-2', name: 'Cursor', key_prefix: 'kefy_sk_cd34', scopes: ['read', 'publish'] })]);
    await page.goto('/es/dashboard/settings');

    await expect(page.getByRole('heading', { name: 'API y MCP' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '+ Crear API key' })).toBeEnabled();

    const row = page.getByRole('listitem').filter({ hasText: 'Claude Code' });
    await expect(row.getByText('kefy_sk_ab12…')).toBeVisible();
    await expect(row.getByText('Lectura')).toBeVisible();
    await expect(row.getByText('Escritura')).toBeVisible();
    await expect(row.getByText(/Todas las marcas · Creada por Test User · Nunca usada · Sin expiración/)).toBeVisible();

    const cursor = page.getByRole('listitem').filter({ hasText: 'Cursor' });
    await expect(cursor.getByText('kefy_sk_cd34…')).toBeVisible();
    await expect(cursor.getByText('Publicación')).toBeVisible();

    // Nunca se muestra un secreto en la lista.
    await expect(page.getByText(/kefy_sk_\w+_/)).toHaveCount(0);
  });

  test('crea una key eligiendo permisos y muestra el secreto una sola vez, con copiar', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    await stubClipboard(page);
    const api = await mockApiKeys(page, []);
    await page.goto('/es/dashboard/settings');

    await expect(page.getByText('Aún no hay API keys.', { exact: false })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: '+ Crear API key' }).click();

    const modal = page.getByRole('dialog').filter({ hasText: 'Nueva API key' });
    await expect(modal).toBeVisible();

    // Permisos: lectura marcada por defecto, las demás no.
    const read = modal.getByRole('checkbox', { name: /Lectura/ });
    const write = modal.getByRole('checkbox', { name: /Escritura/ });
    const publish = modal.getByRole('checkbox', { name: /Publicación/ });
    await expect(read).toBeChecked();
    await expect(write).not.toBeChecked();
    await expect(publish).not.toBeChecked();

    const submit = modal.getByRole('button', { name: 'Crear key' });
    await expect(submit).toBeDisabled(); // sin nombre

    await modal.getByLabel('Nombre').fill('Agente de pruebas');
    await expect(submit).toBeEnabled();

    // Sin ningún permiso no se puede crear.
    await read.uncheck();
    await expect(submit).toBeDisabled();

    await write.check();
    await publish.check();
    // Publicar sin confirmación humana lleva advertencia.
    await expect(modal.getByRole('alert')).toContainText('Puede publicar y responder en redes sin confirmación humana');

    await submit.click();

    // El secreto aparece en un modal que no se cierra por un clic fuera.
    const secretModal = page.getByRole('dialog').filter({ hasText: 'Tu nueva API key' });
    await expect(secretModal).toBeVisible();
    await expect(secretModal).toContainText('Agente de pruebas · kefy_sk_zz99…');
    await expect(secretModal).toContainText('No la volverás a ver');
    await expect(secretModal.getByText(SECRET)).toBeVisible();

    expect(api.posts).toHaveLength(1);
    expect(api.posts[0]).toMatchObject({ name: 'Agente de pruebas', scopes: ['write', 'publish'], lang: 'es' });
    expect(api.posts[0]).not.toHaveProperty('brand_id');
    expect(api.posts[0]).not.toHaveProperty('expires_in_days');

    await secretModal.getByRole('button', { name: 'Copiar' }).click();
    await expect(secretModal.getByRole('button', { name: '✓ Copiado' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toBe(SECRET);

    await page.mouse.click(5, 5);
    await expect(secretModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(secretModal).toBeVisible();

    await secretModal.getByRole('button', { name: 'Ya la guardé' }).click();
    await expect(secretModal).toBeHidden();

    // La lista se recargó: la key nueva, solo con su prefijo.
    const row = page.getByRole('listitem').filter({ hasText: 'Agente de pruebas' });
    await expect(row.getByText('kefy_sk_zz99…')).toBeVisible();
    await expect(page.getByText(SECRET)).toHaveCount(0);

    // Reabrir el modal empieza de cero: el secreto no vuelve.
    await page.getByRole('button', { name: '+ Crear API key' }).click();
    const again = page.getByRole('dialog').filter({ hasText: 'Nueva API key' });
    await expect(again).toBeVisible();
    await expect(page.getByText(SECRET)).toHaveCount(0);
    await expect(again.getByLabel('Nombre')).toHaveValue('');
    await expect(again.getByRole('checkbox', { name: /Lectura/ })).toBeChecked();
    await expect(again.getByRole('checkbox', { name: /Escritura/ })).not.toBeChecked();
    await expect(again.getByRole('checkbox', { name: /Publicación/ })).not.toBeChecked();
    await expect(again.getByRole('alert')).toHaveCount(0);
    expect(api.posts).toHaveLength(1);
  });

  test('revoca una key con una confirmación dentro de la página', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const api = await mockApiKeys(page);
    // Un confirm() nativo no cuenta: la revocación se confirma dentro de la página.
    const nativeDialogs: string[] = [];
    page.on('dialog', (d) => { nativeDialogs.push(`${d.type()}: ${d.message()}`); void d.dismiss(); });
    await page.goto('/es/dashboard/settings');

    const row = page.getByRole('listitem').filter({ hasText: 'Claude Code' });
    await row.getByRole('button', { name: 'Revocar' }).click();

    const confirm = page.getByRole('dialog').filter({ hasText: 'Revocar API key' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('«Claude Code» dejará de funcionar de inmediato');
    await expect(confirm).toContainText('kefy_sk_ab12…');

    // Cancelar no revoca.
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    expect(api.deletes).toHaveLength(0);

    await row.getByRole('button', { name: 'Revocar' }).click();
    await confirm.getByRole('button', { name: 'Sí, revocar' }).click();
    await expect(confirm).toBeHidden();
    expect(api.deletes).toEqual(['key-1']);

    // Pasa a la lista de inactivas.
    await expect(page.getByText('Aún no hay API keys.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Ver revocadas y expiradas (1)' }).click();
    const revoked = page.getByRole('listitem').filter({ hasText: 'Claude Code' });
    await expect(revoked.getByText('Revocada')).toBeVisible();
    await expect(revoked.getByRole('button', { name: 'Revocar' })).toHaveCount(0);
    expect(nativeDialogs).toEqual([]);
  });

  test('un miembro no puede crear API keys ni ve la sección', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'member');
    const api = await mockApiKeys(page);
    await page.goto('/es/dashboard/settings');

    // La página cargó (sección de equipo) pero sin API y MCP.
    await expect(page.getByRole('heading', { name: 'Equipo' })).toBeVisible({ timeout: 15000 });
    // Y ya sabe quién es el usuario (el email sale de /api/auth/me): sin esto,
    // «no hay sección» pasaría también antes de conocer el rol.
    await expect.poll(() => page.locator('input').evaluateAll(
      (els) => els.some((el) => (el as HTMLInputElement).value === 'test@kefy.com'),
    )).toBe(true);
    await expect(page.getByRole('heading', { name: 'API y MCP' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Crear API key/ })).toHaveCount(0);
    expect(api.gets).toBe(0);
    expect(api.posts).toHaveLength(0);
  });

  test('muestra la sección en inglés en /en', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'admin');
    await mockApiKeys(page);
    await page.goto('/en/dashboard/settings');

    await expect(page.getByRole('heading', { name: 'API & MCP' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '+ Create API key' })).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: 'Claude Code' });
    await expect(row.getByText('kefy_sk_ab12…')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Revoke' })).toBeVisible();
  });

  test('ata la key a una marca con expiración y lo muestra en la lista', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const api = await mockApiKeys(page, []);
    await page.goto('/es/dashboard/settings');

    await page.getByRole('button', { name: '+ Crear API key' }).click({ timeout: 15000 });
    const modal = page.getByRole('dialog').filter({ hasText: 'Nueva API key' });
    await modal.getByLabel('Nombre').fill('Solo Test Brand');
    // Por defecto: todas las marcas y sin expiración.
    await expect(modal.getByLabel('Marca', { exact: true })).toHaveValue('');
    await expect(modal.getByLabel('Expiración', { exact: true })).toHaveValue('0');
    await modal.getByLabel('Marca', { exact: true }).selectOption({ label: 'Test Brand' });
    await modal.getByLabel('Expiración', { exact: true }).selectOption({ label: '30 días' });
    await modal.getByRole('button', { name: 'Crear key' }).click();

    const secretModal = page.getByRole('dialog').filter({ hasText: 'Tu nueva API key' });
    await expect(secretModal.getByText(SECRET)).toBeVisible();
    expect(api.posts).toEqual([{ name: 'Solo Test Brand', scopes: ['read'], brand_id: 'brand-test-1', expires_in_days: 30, lang: 'es' }]);
    await secretModal.getByRole('button', { name: 'Ya la guardé' }).click();

    const row = page.getByRole('listitem').filter({ hasText: 'Solo Test Brand' });
    await expect(row).toContainText('Test Brand · Creada por Test User · Nunca usada · Expira el ');
    await expect(row).not.toContainText('Todas las marcas');
    await expect(row).not.toContainText('Sin expiración');
  });

  test('si crear falla, el modal sigue abierto con el motivo y sin secreto', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const api = await mockApiKeys(page, []);
    const failures = [
      { status: 409, body: { error: 'Active key limit reached' }, shown: 'Llegaste al máximo de 10 keys activas. Revoca una para crear otra.' },
      { status: 404, body: { error: 'Brand not found' }, shown: 'Esa marca ya no existe o fue archivada. Elige otra.' },
      { status: 402, body: { error: 'Tu periodo de prueba terminó.', subscriptionRequired: true }, shown: 'Tu periodo de prueba terminó.' },
      { status: 500, body: { error: 'boom: stack trace' }, shown: 'No se pudo crear la key.' },
    ];
    let attempt = 0;
    await page.route('/api/api-keys', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const f = failures[attempt++];
      return route.fulfill({ status: f.status, contentType: 'application/json', body: JSON.stringify(f.body) });
    });
    await page.goto('/es/dashboard/settings');

    await page.getByRole('button', { name: '+ Crear API key' }).click({ timeout: 15000 });
    const modal = page.getByRole('dialog').filter({ hasText: 'Nueva API key' });
    await modal.getByLabel('Nombre').fill('Agente');
    for (const f of failures) {
      await modal.getByRole('button', { name: 'Crear key' }).click();
      await expect(modal.getByRole('alert')).toHaveText(f.shown);
      await expect(modal.getByRole('button', { name: 'Crear key' })).toBeEnabled();
    }
    // Nunca se detallan errores técnicos ni aparece un secreto o un modal de secreto.
    await expect(page.getByText('boom')).toHaveCount(0);
    await expect(page.getByRole('dialog').filter({ hasText: 'Tu nueva API key' })).toHaveCount(0);
    await expect(modal.getByLabel('Nombre')).toHaveValue('Agente');
    expect(attempt).toBe(failures.length);
    expect(api.keys).toHaveLength(0);
  });

  test('si revocar falla, la key sigue activa y se avisa en el modal', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    await mockApiKeys(page);
    let deletes = 0;
    await page.route('/api/api-keys/key-1', (route) => {
      deletes += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"db down"}' });
    });
    await page.goto('/es/dashboard/settings');

    const row = page.getByRole('listitem').filter({ hasText: 'Claude Code' });
    await row.getByRole('button', { name: 'Revocar' }).click({ timeout: 15000 });
    const confirm = page.getByRole('dialog').filter({ hasText: 'Revocar API key' });
    await confirm.getByRole('button', { name: 'Sí, revocar' }).click();

    await expect(confirm.getByRole('alert')).toHaveText('No se pudo revocar la key.');
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Sí, revocar' })).toBeEnabled();
    expect(deletes).toBe(1);

    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(row.getByRole('button', { name: 'Revocar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver revocadas y expiradas/ })).toHaveCount(0);
  });

  test('con 10 keys activas no deja crear otra', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const keys = Array.from({ length: 10 }, (_, i) => mockApiKey({ id: `key-${i}`, name: `Key ${i}`, key_prefix: `kefy_sk_k${i}0` }));
    await mockApiKeys(page, [...keys, mockApiKey({ id: 'key-old', name: 'Vieja', status: 'revoked', revoked_at: '2026-09-10T00:00:00Z' })]);
    await page.goto('/es/dashboard/settings');

    await expect(page.getByRole('listitem').filter({ hasText: 'Key 9' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '+ Crear API key' })).toBeDisabled();
    await expect(page.getByText('Máximo 10 keys activas por organización.')).toBeVisible();
  });

  test('muestra las keys expiradas aparte, sin botón de revocar', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    await mockApiKeys(page, [
      mockApiKey(),
      mockApiKey({ id: 'key-exp', name: 'Integración vieja', key_prefix: 'kefy_sk_ex01', status: 'expired', expires_at: '2026-08-01T00:00:00Z', last_used_at: '2026-07-30T00:00:00Z' }),
    ]);
    await page.goto('/es/dashboard/settings');

    await expect(page.getByRole('listitem').filter({ hasText: 'Claude Code' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Integración vieja')).toHaveCount(0);
    const toggle = page.getByRole('button', { name: 'Ver revocadas y expiradas (1)' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();

    const expired = page.getByRole('listitem').filter({ hasText: 'Integración vieja' });
    await expect(expired.getByText('Expirada')).toBeVisible();
    await expect(expired).toContainText('Expiró el ');
    await expect(expired).toContainText('Último uso ');
    await expect(expired.getByRole('button', { name: 'Revocar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ocultar revocadas y expiradas' }).click();
    await expect(expired).toHaveCount(0);
  });

  test('si la lista no carga, avisa y «Reintentar» la vuelve a pedir', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    const api = await mockApiKeys(page);
    let failOnce = true;
    await page.route('/api/api-keys', (route) => {
      if (route.request().method() === 'GET' && failOnce) {
        failOnce = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      }
      return route.fallback();
    });
    await page.goto('/es/dashboard/settings');

    await expect(page.getByText('No pudimos cargar las API keys.')).toBeVisible({ timeout: 15000 });
    // Un fallo de carga no se confunde con «no hay keys».
    await expect(page.getByText('Aún no hay API keys.', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reintentar' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'Claude Code' })).toBeVisible();
    await expect(page.getByText('No pudimos cargar las API keys.')).toHaveCount(0);
    expect(api.gets).toBeGreaterThanOrEqual(1);
  });

  test('muestra la URL del servidor MCP y los ejemplos de conexión', async ({ authenticatedPage: page, baseURL }) => {
    await actAs(page, baseURL!, 'owner');
    await mockApiKeys(page);
    await page.goto('/es/dashboard/settings');

    const mcpUrl = `${new URL(baseURL!).origin}/api/mcp`;
    await expect(page.getByText(mcpUrl, { exact: true })).toBeVisible({ timeout: 15000 });
    const tab = (name: string) => page.getByRole('tab', { name, exact: true });
    await expect(tab('Claude Code')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(`claude mcp add --transport http kefy ${mcpUrl}`, { exact: false })).toBeVisible();

    await tab('curl').click();
    await expect(tab('curl')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(`${new URL(baseURL!).origin}/api/v1/tools`, { exact: false })).toBeVisible();
    // Los ejemplos nunca llevan una key real.
    await expect(page.getByText(/kefy_sk_[a-z0-9]{4}_/)).toHaveCount(0);
  });
});
