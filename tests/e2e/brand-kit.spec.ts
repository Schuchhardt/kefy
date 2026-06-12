import { test, expect } from './fixtures/auth';

test.describe('Brand Kit', () => {
  test('muestra tabs de Identidad, Mercado y Estrategia', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    await expect(page.getByRole('link', { name: /^Identidad$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Mercado$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Estrategia$/i })).toBeVisible();
  });

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
    let patchBody: Record<string, unknown> | null = null;

    // Interceptar el PATCH
    await page.route('/api/brand-kit', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ kit: { ...(patchBody ?? {}), id: 'kit-1' } }),
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

      await expect.poll(() => patchBody).not.toBeNull();
      expect(patchBody).toMatchObject({ name: 'Nuevo Nombre de Marca' });
      expect(patchBody).not.toHaveProperty('company_size');
      expect(patchBody).not.toHaveProperty('niche');
      expect(patchBody).not.toHaveProperty('target_audience');
      expect(patchBody).not.toHaveProperty('differentiators');
      expect(patchBody).not.toHaveProperty('challenges');
      expect(patchBody).not.toHaveProperty('competitors');

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
    await page.goto('/es/dashboard/brand/market');
    await expect(page).toHaveURL(/\/brand\/market/);
    await expect(page.locator('label', { hasText: 'Tamaño de la empresa' })).toHaveCount(1);
    await expect(page.locator('label', { hasText: 'Diferenciadores' })).toHaveCount(1);
    await expect(page.locator('label', { hasText: 'Competidores' })).toHaveCount(1);
    await expect(page.locator('label', { hasText: 'Dificultades / Retos' })).toHaveCount(1);
  });

  test('identidad no muestra campos exclusivos de mercado', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    await expect(page).toHaveURL(/\/brand\/identity/);
    await expect(page.locator('label', { hasText: 'Tamaño de la empresa' })).toHaveCount(0);
    await expect(page.locator('label', { hasText: 'Diferenciadores' })).toHaveCount(0);
    await expect(page.locator('label', { hasText: 'Competidores' })).toHaveCount(0);
    await expect(page.locator('label', { hasText: 'Dificultades / Retos' })).toHaveCount(0);
  });
});
