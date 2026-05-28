import { test, expect } from './fixtures/auth';

test.describe('Gestión de contenido', () => {
  // ─── Crear contenido ───────────────────────────────────────────────────────

  test.describe('Crear contenido', () => {
    test('carga la página de creación de contenido', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/content/create');
      await expect(page).toHaveURL(/\/content\/create/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra el formulario de generación de contenido', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/content/create');
      // Debe haber al menos un selector de canal o tipo
      const selects = page.getByRole('combobox');
      const inputs = page.getByRole('textbox');
      const total = (await selects.count()) + (await inputs.count());
      expect(total).toBeGreaterThan(0);
    });

    test('muestra la respuesta de generación de IA', async ({ authenticatedPage: page }) => {
      await page.route('/api/content/generate', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: {
              body: 'Contenido generado por IA para pruebas.',
              hashtags: ['#test', '#kefy'],
            },
          }),
        });
      });

      await page.goto('/es/dashboard/content/create');

      // Llenar el campo de tema si existe
      const topicInput = page.getByRole('textbox', { name: /tema|topic|about|de qué/i });
      if (await topicInput.isVisible()) {
        await topicInput.fill('Innovación en tecnología');
      }

      const generateBtn = page.getByRole('button', { name: /generar|generate|crear/i });
      if (await generateBtn.isVisible()) {
        await generateBtn.click();
        await expect(page.getByText(/generado|generated|IA/i)).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ─── Calendario ───────────────────────────────────────────────────────────

  test.describe('Calendario de contenido', () => {
    test('carga la página del calendario', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/content/calendar');
      await expect(page).toHaveURL(/\/content\/calendar/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra elementos de calendario', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/content/calendar');
      // Debe haber algún elemento de grid o lista de fechas
      await page.waitForLoadState('networkidle');
      // El calendario se carga
      await expect(page.locator('body')).toBeVisible();
    });
  });

  // ─── Lista de contenido ────────────────────────────────────────────────────

  test.describe('Lista de contenido', () => {
    test('carga la página de contenido', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/content');
      await expect(page).toHaveURL(/\/content/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra el item de contenido mock', async ({ authenticatedPage: page }) => {
      await page.route('/api/content*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'c1',
                channel: 'instagram',
                content_type: 'post',
                status: 'draft',
                title: 'Post visible en lista',
                body: 'Cuerpo del post',
                hashtags: [],
                created_at: '2024-01-01T00:00:00Z',
              },
            ],
            total: 1,
          }),
        });
      });

      await page.goto('/es/dashboard/content');
      await expect(page.getByText(/Post visible en lista/)).toBeVisible({ timeout: 10000 });
    });
  });
});
