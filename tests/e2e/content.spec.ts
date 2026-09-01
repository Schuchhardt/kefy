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
      // Misma forma que devuelve POST /api/content/generate: el texto va en
      // `result`, no en la raíz.
      await page.route('**/api/content/generate', (route) => {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            itemId: 'c-gen-1',
            result: {
              body: 'Contenido generado por IA para pruebas.',
              hashtags: ['#test', '#kefy'],
              model: 'claude',
              tokensUsed: 42,
            },
            draft: null,
          }),
        });
      });

      await page.goto('/es/dashboard/content/create');

      // El locator anterior (`/generar|generate|crear/i`) coincidía con «Crear
      // sin IA» y con «Generar con IA» a la vez, y los `if (isVisible())`
      // convertían el test en un no-op cuando no resolvía: nunca comprobaba nada.
      //
      // El flujo real son dos pasos: «Generar con IA» abre el panel, y dentro
      // está el campo de tema y el botón «Generar Post».
      await page.getByRole('button', { name: /Generar con IA/i }).click();
      await page.locator('#gen-topic-textarea').fill('Innovación en tecnología');
      await page.getByRole('button', { name: /^Generar Post$/i }).click();

      // Se afirma el texto devuelto por el mock, no una palabra suelta como
      // «IA» que también aparece en el propio botón.
      await expect(
        page.getByText('Contenido generado por IA para pruebas.'),
      ).toBeVisible({ timeout: 15000 });
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
      await page.route('**/api/content?*', (route) => {
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
      // La tarjeta muestra `body` y sólo cae en `title` si no hay cuerpo.
      await expect(page.getByText(/Cuerpo del post/)).toBeVisible({ timeout: 10000 });
    });
  });
});
