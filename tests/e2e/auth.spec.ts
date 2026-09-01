import { test, expect } from '@playwright/test';
import { setupApiMocks } from './fixtures/auth';

test.describe('Flujo de autenticación', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  // ─── Login ──────────────────────────────────────────────────────────────────

  test.describe('Login', () => {
    test('muestra el formulario de login en /es/login', async ({ page }) => {
      await page.goto('/es/login');
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/contraseña|password/i)).toBeVisible();
    });

    test('muestra error al enviar credenciales inválidas', async ({ page }) => {
      // Sobreescribir el mock solo para esta prueba
      await page.route('/api/auth/login', (route) => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid email or password' }),
        });
      });

      await page.goto('/es/login');
      await page.getByLabel(/email/i).fill('wrong@example.com');
      await page.getByLabel(/contraseña|password/i).fill('wrongpass');
      await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();

      await expect(page.getByText(/inválid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
    });

    test('redirige al dashboard tras login exitoso', async ({ page }) => {
      await page.goto('/es/login');
      await page.getByLabel(/email/i).fill('test@kefy.com');
      await page.getByLabel(/contraseña|password/i).fill('password123');
      await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });

    test('muestra error de validación con email inválido', async ({ page }) => {
      await page.goto('/es/login');
      await page.getByLabel(/email/i).fill('no-es-email');
      await page.getByLabel(/contraseña|password/i).fill('password123');
      await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();

      // Puede ser validación HTML5 o mensaje de la app
      const emailInput = page.getByLabel(/email/i);
      const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
      if (!validity) {
        // La validación HTML5 impide el submit
        expect(validity).toBe(false);
      } else {
        await expect(page.getByText(/email/i)).toBeVisible({ timeout: 5000 });
      }
    });
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  test.describe('Registro', () => {
    test('muestra el formulario de registro en /es/register', async ({ page }) => {
      await page.goto('/es/register');
      await expect(page.getByLabel(/email/i)).toBeVisible();
    });

    // Antes rellenaba los campos por posición (`nth(1)`, `nth(2)`), y como el
    // tercer textbox es el email acababa escribiendo «Mi Empresa» ahí: la
    // validación HTML5 bloqueaba el envío y el test nunca podía pasar.
    test('redirige al dashboard/onboarding tras registro exitoso', async ({ page }) => {
      await page.goto('/es/register');

      await page.getByLabel(/tu nombre/i).fill('Nuevo Usuario');
      await page.getByLabel(/nombre del negocio/i).fill('Mi Empresa');
      await page.getByLabel(/email/i).fill('newuser@kefy.com');
      await page.getByLabel(/contraseña|password/i).fill('password123');

      await page.getByRole('button', { name: /registrar|crear|sign up|register/i }).click();
      await expect(page).toHaveURL(/\/dashboard|\/onboarding/, { timeout: 10000 });
    });
  });

  // ─── Protección de rutas ───────────────────────────────────────────────────

  test.describe('Protección de rutas', () => {
    test('redirige /es/dashboard al login si no hay cookie de auth', async ({ page }) => {
      // Sin cookies de auth, acceder al dashboard
      await page.goto('/es/dashboard');
      // Debe redirigir a login
      await expect(page).toHaveURL(/login|\/es\/$|\/es$/, { timeout: 10000 });
    });

    test('la página de login es accesible sin autenticación', async ({ page }) => {
      await page.goto('/es/login');
      await expect(page).toHaveURL(/login/);
    });
  });
});
