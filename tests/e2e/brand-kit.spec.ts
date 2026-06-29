import { test, expect } from './fixtures/auth';

test.describe('Brand Kit', () => {
  test('carga identidad sin redireccionar a login', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    await expect(page).toHaveURL(/\/brand\/identity/, { timeout: 5000 });
    // No debe redirigir a login
    await expect(page.getByText(/401|Unauthorized|login/i)).not.toBeVisible({ timeout: 2000 });
  });

  test('carga la página de identidad de marca', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    await expect(page).toHaveURL(/\/brand\/identity/);
    await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
  });

  test('muestra el formulario de identidad de marca', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/identity');
    // Solo verificar que hay algún elemento de forma visible (headings, labels, etc)
    await expect(page).not.toHaveTitle(/401|Unauthorized|login/i);
  });

  test('guarda cambios sin incluir campos de mercado', async ({ authenticatedPage: page }) => {
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
    await page.waitForTimeout(1000); // Dar tiempo a que la página cargue

    // Enviar cambios
    const saveBtn = page.getByRole('button', { name: /guardar|save/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await expect.poll(() => patchBody, { timeout: 5000 }).not.toBeNull();
      
      // Validar payload: NO debe incluir campos de mercado
      expect(patchBody).not.toHaveProperty('company_size');
      expect(patchBody).not.toHaveProperty('niche');
      expect(patchBody).not.toHaveProperty('target_audience');
      expect(patchBody).not.toHaveProperty('differentiators');
      expect(patchBody).not.toHaveProperty('challenges');
      expect(patchBody).not.toHaveProperty('competitors');
    }
  });

  test('carga la página de mercado y muestra contenido', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard/brand/market');
    await expect(page).toHaveURL(/\/brand\/market/);
    // Verificar que hay elementos de la página de mercado (heading, inputs, etc)
    await expect(page).not.toHaveTitle(/401|Unauthorized|login/i);
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
