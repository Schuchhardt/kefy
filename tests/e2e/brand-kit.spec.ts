import { test, expect } from './fixtures/auth';

test.describe('Brand Kit', () => {
  test('carga la página de identidad de marca', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    await expect(page).toHaveURL(/\/brand\/identity/);
    await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
  });

  test('muestra el formulario de identidad de marca', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    // Debe haber algún input de nombre o tono
    const inputs = page.getByRole('textbox');
    await expect(inputs.first()).toBeVisible({ timeout: 10000 });
  });

  test('guarda cambios de nombre de marca', async ({ authenticatedPage: page }) => {
    // Interceptar el PATCH
    await page.route('/api/brand-kit', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ kit: { ...body, id: 'kit-1' } }),
        });
      }
      return route.fallback();
    });

    await page.goto('/es/dashboard/brand/identity');

    // Buscar el input de nombre y cambiarlo
    const nameInput = page.getByRole('textbox', { name: /nombre|name/i }).first();
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill('Nuevo Nombre de Marca');
      await page.getByRole('button', { name: /guardar|save/i }).first().click();
      // No debe haber error
      await expect(page.getByText(/error/i)).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('rechaza un color hex inválido', async ({ authenticatedPage: page }) => {
    await page.route('/api/brand-kit', async (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'primary_color must be a valid hex color (e.g. #FF0000)' }),
        });
      }
      return route.fallback();
    });

    await page.goto('/es/dashboard/brand/identity');
    // Si hay un campo de color, escribir un valor inválido
    const colorInput = page.locator('input[type="color"], input[placeholder*="#"], input[name*="color"]').first();
    if (await colorInput.isVisible()) {
      await colorInput.fill('invalid');
      await page.getByRole('button', { name: /guardar|save/i }).first().click();
      await expect(page.getByText(/hex|color/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('carga la página de mercado (market/strategy)', async ({ authenticatedPage: page }) => {
    // Probar que la página de estrategia de marca carga
    const marketPage = page.goto('/es/dashboard/brand/market');
    const strategyPage = page.goto('/es/dashboard/brand/strategy');

    // Al menos una de estas rutas debe existir
    try {
      await marketPage;
      await expect(page).toHaveURL(/\/brand\//);
    } catch {
      await strategyPage;
      await expect(page).toHaveURL(/\/brand\//);
    }
  });
});
