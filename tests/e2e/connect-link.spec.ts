import { test, expect } from './fixtures/auth';

// Enlace directo para conectar una red: lo devuelven el asistente, la API REST
// y el MCP con la forma /{lang}/dashboard/settings?connect=<red>&brand=<id>.
// Al abrirlo, ajustes arranca solo el mismo flujo que el botón de conectar.

const OAUTH_URL = 'https://oauth.connect-link.test/authorize?platform=instagram';

test.describe('Enlace directo de conexión', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // La redirección a Zernio no debe salir a internet.
    await page.route('https://oauth.connect-link.test/**', (route) => route.abort());
  });

  test('pide la URL de OAuth de Instagram y navega a ella', async ({ authenticatedPage: page }) => {
    const oauthRequests: string[] = [];
    await page.route('**/api/social/oauth/url*', async (route) => {
      oauthRequests.push(route.request().url());
      // Se retrasa la respuesta para poder ver el aviso de estado.
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: OAUTH_URL, state: 'test-state' }),
      });
    });

    const navigation = page.waitForRequest((req) => req.url() === OAUTH_URL, { timeout: 20000 });
    await page.goto('/es/dashboard/settings?connect=instagram');

    await expect(page.getByRole('status').filter({ hasText: 'Conectando Instagram…' })).toBeVisible({ timeout: 15000 });
    await navigation;

    expect(oauthRequests).toHaveLength(1);
    const requested = new URL(oauthRequests[0]);
    expect(requested.searchParams.get('platform')).toBe('instagram');
    expect(requested.searchParams.get('returnTo')).toBe('/es/dashboard/settings');
  });

  test('en inglés muestra el estado en inglés', async ({ authenticatedPage: page }) => {
    await page.route('**/api/social/oauth/url*', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: OAUTH_URL, state: 'test-state' }),
      });
    });

    const navigation = page.waitForRequest((req) => req.url() === OAUTH_URL, { timeout: 20000 });
    await page.goto('/en/dashboard/settings?connect=instagram');

    await expect(page.getByRole('status').filter({ hasText: 'Connecting Instagram…' })).toBeVisible({ timeout: 15000 });
    await navigation;
  });

  test('red desconocida: muestra el error y no pide la URL de OAuth', async ({ authenticatedPage: page }) => {
    let oauthRequested = false;
    await page.route('**/api/social/oauth/url*', (route) => {
      oauthRequested = true;
      return route.abort();
    });

    await page.goto('/es/dashboard/settings?connect=myspace');

    await expect(page.getByText(/apunta a una red que Kefy no admite/)).toBeVisible({ timeout: 15000 });
    await expect(page).not.toHaveURL(/connect=/);
    expect(oauthRequested).toBe(false);
  });
});
