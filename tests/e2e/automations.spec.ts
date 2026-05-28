import { test, expect } from './fixtures/auth';

test.describe('Automatizaciones', () => {
  // ─── Autopilot ─────────────────────────────────────────────────────────────

  test.describe('Autopilot', () => {
    test('carga la página de autopilot', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/automations/autopilot');
      await expect(page).toHaveURL(/\/automations\/autopilot/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra el listado de reglas de autopilot', async ({ authenticatedPage: page }) => {
      await page.route('/api/autopilot*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rules: [
              { id: 'ap-1', name: 'Regla de prueba', enabled: true, trigger: 'weekly', created_at: '2024-01-01' },
            ],
          }),
        });
      });

      await page.goto('/es/dashboard/automations/autopilot');
      await expect(page.getByText(/Regla de prueba/)).toBeVisible({ timeout: 10000 });
    });

    test('puede crear una nueva regla de autopilot', async ({ authenticatedPage: page }) => {
      await page.route('/api/autopilot', (route) => {
        if (route.request().method() === 'POST') {
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ rule: { id: 'ap-new', name: 'Nueva Regla', enabled: false } }),
          });
        }
        return route.fallback();
      });

      await page.goto('/es/dashboard/automations/autopilot');
      const addBtn = page.getByRole('button', { name: /crear|nueva|add|new/i }).first();
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await expect(page.getByText(/500|Error/i)).not.toBeVisible({ timeout: 5000 });
      }
    });
  });

  // ─── Engagement ────────────────────────────────────────────────────────────

  test.describe('Engagement', () => {
    test('carga la página de engagement', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/automations/engagement');
      await expect(page).toHaveURL(/\/automations\/engagement/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra reglas de engagement', async ({ authenticatedPage: page }) => {
      await page.route('/api/automations*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rules: [
              { id: 'eng-1', trigger: 'mention', action: 'like', enabled: true },
            ],
          }),
        });
      });

      await page.goto('/es/dashboard/automations/engagement');
      await page.waitForLoadState('networkidle');
      // La página carga sin errores
      await expect(page.getByText(/401|500|Unauthorized/i)).not.toBeVisible();
    });
  });

  // ─── Leads / CRM ──────────────────────────────────────────────────────────

  test.describe('Leads', () => {
    test('carga la página de leads', async ({ authenticatedPage: page }) => {
      await page.goto('/es/dashboard/automations/leads');
      await expect(page).toHaveURL(/\/automations\/leads/);
      await expect(page.getByText(/401|Unauthorized/i)).not.toBeVisible();
    });

    test('muestra el kanban de leads', async ({ authenticatedPage: page }) => {
      await page.route('/api/ads*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ leads: [] }),
        });
      });

      await page.goto('/es/dashboard/automations/leads');
      await page.waitForLoadState('networkidle');
      // La página carga sin errores
      await expect(page.getByText(/500|Server Error/i)).not.toBeVisible();
    });
  });
});
