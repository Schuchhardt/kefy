# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Flujo de autenticación >> Login >> muestra error de validación con email inválido
- Location: tests/e2e/auth.spec.ts:45:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: /contraseña|password/i })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link "Kefy Kefy" [ref=e7] [cursor=pointer]:
          - /url: /es
          - img "Kefy" [ref=e8]
          - generic [ref=e9]: Kefy
        - paragraph [ref=e10]: Inicia sesión en tu cuenta
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Email
          - textbox "tu@email.com" [active] [ref=e14]: no-es-email
        - generic [ref=e15]:
          - generic [ref=e16]: Contraseña
          - textbox "••••••••" [ref=e17]
        - button "Iniciar sesión" [ref=e18] [cursor=pointer]
      - paragraph [ref=e19]:
        - text: ¿No tienes cuenta?
        - link "Regístrate gratis" [ref=e20] [cursor=pointer]:
          - /url: /es/register
    - contentinfo [ref=e21]:
      - link "Términos de servicio" [ref=e22] [cursor=pointer]:
        - /url: /es/terminos
      - link "Privacidad" [ref=e23] [cursor=pointer]:
        - /url: /es/privacidad
      - link "Cookies" [ref=e24] [cursor=pointer]:
        - /url: /es/cookies
      - generic [ref=e25]: © 2026 Kefy
  - button "Open Next.js Dev Tools" [ref=e31] [cursor=pointer]:
    - img [ref=e32]
  - alert [ref=e35]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { setupApiMocks } from './fixtures/auth';
  3   | 
  4   | test.describe('Flujo de autenticación', () => {
  5   |   test.beforeEach(async ({ page }) => {
  6   |     await setupApiMocks(page);
  7   |   });
  8   | 
  9   |   // ─── Login ──────────────────────────────────────────────────────────────────
  10  | 
  11  |   test.describe('Login', () => {
  12  |     test('muestra el formulario de login en /es/login', async ({ page }) => {
  13  |       await page.goto('/es/login');
  14  |       await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  15  |       await expect(page.getByRole('textbox', { name: /contraseña|password/i })).toBeVisible();
  16  |     });
  17  | 
  18  |     test('muestra error al enviar credenciales inválidas', async ({ page }) => {
  19  |       // Sobreescribir el mock solo para esta prueba
  20  |       await page.route('/api/auth/login', (route) => {
  21  |         route.fulfill({
  22  |           status: 401,
  23  |           contentType: 'application/json',
  24  |           body: JSON.stringify({ error: 'Invalid email or password' }),
  25  |         });
  26  |       });
  27  | 
  28  |       await page.goto('/es/login');
  29  |       await page.getByRole('textbox', { name: /email/i }).fill('wrong@example.com');
  30  |       await page.getByRole('textbox', { name: /contraseña|password/i }).fill('wrongpass');
  31  |       await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();
  32  | 
  33  |       await expect(page.getByText(/inválid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
  34  |     });
  35  | 
  36  |     test('redirige al dashboard tras login exitoso', async ({ page }) => {
  37  |       await page.goto('/es/login');
  38  |       await page.getByRole('textbox', { name: /email/i }).fill('test@kefy.com');
  39  |       await page.getByRole('textbox', { name: /contraseña|password/i }).fill('password123');
  40  |       await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();
  41  | 
  42  |       await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  43  |     });
  44  | 
  45  |     test('muestra error de validación con email inválido', async ({ page }) => {
  46  |       await page.goto('/es/login');
  47  |       await page.getByRole('textbox', { name: /email/i }).fill('no-es-email');
> 48  |       await page.getByRole('textbox', { name: /contraseña|password/i }).fill('password123');
      |                                                                         ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  49  |       await page.getByRole('button', { name: /entrar|iniciar|login|sign in/i }).click();
  50  | 
  51  |       // Puede ser validación HTML5 o mensaje de la app
  52  |       const emailInput = page.getByRole('textbox', { name: /email/i });
  53  |       const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
  54  |       if (!validity) {
  55  |         // La validación HTML5 impide el submit
  56  |         expect(validity).toBe(false);
  57  |       } else {
  58  |         await expect(page.getByText(/email/i)).toBeVisible({ timeout: 5000 });
  59  |       }
  60  |     });
  61  |   });
  62  | 
  63  |   // ─── Register ──────────────────────────────────────────────────────────────
  64  | 
  65  |   test.describe('Registro', () => {
  66  |     test('muestra el formulario de registro en /es/register', async ({ page }) => {
  67  |       await page.goto('/es/register');
  68  |       await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  69  |     });
  70  | 
  71  |     test('redirige al dashboard/onboarding tras registro exitoso', async ({ page }) => {
  72  |       await page.goto('/es/register');
  73  | 
  74  |       // Llenar campos del formulario
  75  |       const emailInput = page.getByRole('textbox', { name: /email/i });
  76  |       const passwordInput = page.getByRole('textbox', { name: /contraseña|password/i });
  77  | 
  78  |       if (await emailInput.isVisible()) {
  79  |         await emailInput.fill('newuser@kefy.com');
  80  |       }
  81  | 
  82  |       if (await passwordInput.isVisible()) {
  83  |         await passwordInput.fill('password123');
  84  |       }
  85  | 
  86  |       // Buscar campos de nombre
  87  |       const nameInputs = page.getByRole('textbox');
  88  |       const count = await nameInputs.count();
  89  |       if (count >= 3) {
  90  |         await nameInputs.nth(1).fill('Nuevo Usuario');
  91  |         await nameInputs.nth(2).fill('Mi Empresa');
  92  |       }
  93  | 
  94  |       await page.getByRole('button', { name: /registrar|crear|sign up|register/i }).click();
  95  |       await expect(page).toHaveURL(/\/dashboard|\/onboarding/, { timeout: 10000 });
  96  |     });
  97  |   });
  98  | 
  99  |   // ─── Protección de rutas ───────────────────────────────────────────────────
  100 | 
  101 |   test.describe('Protección de rutas', () => {
  102 |     test('redirige /es/dashboard al login si no hay cookie de auth', async ({ page }) => {
  103 |       // Sin cookies de auth, acceder al dashboard
  104 |       await page.goto('/es/dashboard');
  105 |       // Debe redirigir a login
  106 |       await expect(page).toHaveURL(/login|\/es\/$|\/es$/, { timeout: 10000 });
  107 |     });
  108 | 
  109 |     test('la página de login es accesible sin autenticación', async ({ page }) => {
  110 |       await page.goto('/es/login');
  111 |       await expect(page).toHaveURL(/login/);
  112 |     });
  113 |   });
  114 | });
  115 | 
```