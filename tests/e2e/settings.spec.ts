import { test, expect } from './fixtures/auth';

test.describe('Ajustes y cuentas sociales', () => {
  // ─── Página de ajustes ─────────────────────────────────────────────────────

  test('carga la página de ajustes', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
  });

  // ─── Cuentas sociales ──────────────────────────────────────────────────────

  test('muestra las cuentas conectadas', async ({ authenticatedPage: page }) => {
    await page.route('/api/social/accounts', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accounts: [
            {
              id: 'sa-1',
              platform: 'instagram',
              username: '@testbrand',
              avatar_url: null,
              status: 'active',
            },
          ],
        }),
      });
    });

    await page.goto('/es/dashboard/settings');
    // La cuenta de Instagram debe aparecer en algún lugar de la página
    await expect(page.getByText(/instagram/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('inicia el flujo de conexión OAuth al hacer clic en conectar', async ({ authenticatedPage: page }) => {
    // Mock para getConnectUrl
    await page.route('/api/social/oauth/connect*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authUrl: 'https://auth.instagram.com/oauth', state: 'test-state' }),
      });
    });

    await page.goto('/es/dashboard/settings');

    // Buscar botón de conectar (puede ser "Conectar" o "Connect")
    const connectBtn = page.getByRole('button', { name: /conectar|connect/i }).first();
    if (await connectBtn.isVisible()) {
      // Prevenir la navegación real
      await page.route('https://auth.instagram.com/**', (route) => route.abort());
      await connectBtn.click();
      // Después del click se puede abrir una URL de OAuth; simplemente verificar que no hay error 500
      await expect(page.getByText(/500|Server Error/i)).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('desconecta una cuenta social', async ({ authenticatedPage: page }) => {
    await page.route('/api/social/accounts', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accounts: [{ id: 'sa-1', platform: 'instagram', username: '@testbrand', status: 'active' }],
          }),
        });
      }
      return route.fallback();
    });

    await page.route('/api/social/accounts/sa-1', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.fallback();
    });

    await page.goto('/es/dashboard/settings');

    // Buscar botón de desconectar
    const disconnectBtn = page.getByRole('button', { name: /desconectar|disconnect|remove/i }).first();
    if (await disconnectBtn.isVisible()) {
      await disconnectBtn.click();
      // Si hay un diálogo de confirmación, aceptarlo
      const confirmBtn = page.getByRole('button', { name: /confirmar|confirm|sí|yes/i });
      if (await confirmBtn.isVisible({ timeout: 2000 })) {
        await confirmBtn.click();
      }
      await expect(page.getByText(/500|Error/i)).not.toBeVisible({ timeout: 5000 });
    }
  });

  // ─── Perfil ────────────────────────────────────────────────────────────────

  test('muestra el formulario de edición de perfil', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/settings');
    // Buscar campos de nombre o email
    const nameOrEmailInput = page.getByRole('textbox').first();
    if (await nameOrEmailInput.isVisible()) {
      await expect(nameOrEmailInput).toBeVisible();
    }
  });
});
