import { test, expect } from './fixtures/auth';

test.describe('Dashboard principal', () => {
  test('carga el dashboard para un usuario autenticado', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    await expect(page).toHaveURL(/\/es\/dashboard/);
    // La página no debe mostrar error de autenticación
    await expect(page.getByText(/401|Unauthorized|No autorizado/i)).not.toBeVisible();
  });

  test('muestra el sidebar de navegación', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    // El sidebar debe contener los ítems principales
    await expect(page.getByRole('link', { name: /contenido|content/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('tiene la navegación inferior en móvil', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/es/dashboard');
    // El nav de abajo debe existir
    const bottomNav = page.locator('nav.bottom-nav, nav[class*="bottom"]');
    if (await bottomNav.isVisible()) {
      await expect(bottomNav).toBeVisible();
    }
  });

  // Cubierto en las dos vistas: en escritorio lo trae el sidebar y en móvil la
  // barra superior (ver brand-switcher.spec.ts).
  test('el BrandSwitcher está presente', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');

    // Se busca una instancia *visible*: el nombre de la marca está en el
    // sidebar y en la barra móvil, y en cada vista una de las dos está oculta
    // por CSS. Sin el filtro, `.first()` cae en la del sidebar y falla en móvil.
    await expect(
      page.locator(':visible').filter({ hasText: /^Test Brand$/ }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('navega a /es/dashboard/content al hacer clic en Contenido', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    await page.getByRole('link', { name: /^contenido$|^content$/i }).first().click();
    await expect(page).toHaveURL(/\/content/, { timeout: 8000 });
  });

  test('navega a /es/dashboard/brand al hacer clic en Mi Marca', async ({ authenticatedPage: page }) => {
    await page.goto('/es/dashboard');
    await page.getByRole('link', { name: /mi marca|my brand/i }).first().click();
    await expect(page).toHaveURL(/\/brand/, { timeout: 8000 });
  });
});
