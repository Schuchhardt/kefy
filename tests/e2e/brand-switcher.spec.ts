import { test, expect } from './fixtures/auth';

// El selector de marca vive en el sidebar, que en móvil está oculto por CSS.
// Sin un equivalente, quien gestiona varias marcas no podía cambiar entre ellas
// desde el teléfono. Estos tests fijan que exista en móvil y solo ahí.

test.describe('Selector de marca', () => {
  test('en móvil está visible y muestra la marca activa', async ({ authenticatedPage: page, isMobile }) => {
    test.skip(!isMobile, 'Comprobación específica de móvil');

    await page.goto('/es/dashboard');
    const selector = page.locator('.brand-switcher-mobile');

    await expect(selector).toBeVisible({ timeout: 10000 });
    await expect(selector.getByText('Test Brand')).toBeVisible();
  });

  test('en móvil despliega la lista de marcas', async ({ authenticatedPage: page, isMobile }) => {
    test.skip(!isMobile, 'Comprobación específica de móvil');

    await page.goto('/es/dashboard');
    await page.locator('.brand-switcher-mobile').getByRole('button').first().click();

    // La marca activa aparece marcada y se ofrece crear otra.
    await expect(page.getByText('Nueva marca')).toBeVisible({ timeout: 5000 });
  });

  // En escritorio el sidebar ya lo trae: duplicarlo sería un selector de más.
  test('en escritorio no se muestra, porque lo trae el sidebar', async ({ authenticatedPage: page, isMobile }) => {
    test.skip(!!isMobile, 'Comprobación específica de escritorio');

    await page.goto('/es/dashboard');
    await expect(page.locator('.brand-switcher-mobile')).toBeHidden();
    await expect(page.getByText('Test Brand').first()).toBeVisible({ timeout: 10000 });
  });
});
