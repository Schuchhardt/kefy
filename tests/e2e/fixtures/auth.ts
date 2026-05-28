import { test as base, type Page } from '@playwright/test';
import { API_MOCK_MAP } from './api-mocks';

/**
 * Configura los interceptores de red para todos los endpoints de la API.
 * Simula que el usuario está autenticado y tiene una brand activa.
 */
async function setupApiMocks(page: Page) {
  // Interceptar todas las rutas /api/*
  await page.route('/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    // Auth: login y register siempre retornan éxito
    if (pathname === '/api/auth/login' && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u1', email: 'test@kefy.com', name: 'Test' }, orgId: 'org-1' }),
        headers: {
          'Set-Cookie': 'kefy_access=fake-token; Path=/; HttpOnly',
        },
      });
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u2', email: 'new@kefy.com', name: 'New' }, orgId: 'org-2' }),
        headers: {
          'Set-Cookie': 'kefy_access=fake-token; Path=/; HttpOnly',
        },
      });
    }

    if (pathname === '/api/auth/logout') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    if (pathname === '/api/auth/refresh') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    // Respuesta mock genérica por pathname
    const mockResponse = API_MOCK_MAP[pathname];
    if (mockResponse) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    }

    // PATCH/POST/DELETE: responder con éxito genérico
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    // Fallback: respuesta vacía exitosa
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Simula que el usuario ya está autenticado configurando cookies.
 * Luego configura los mocks de API.
 */
async function setupAuthenticatedState(page: Page, baseURL: string) {
  // Navegar primero para que las cookies se puedan setear en el dominio correcto
  await page.goto(baseURL);
  await page.context().addCookies([
    {
      name: 'kefy_access',
      value: 'fake-jwt-token-for-testing',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
    },
    {
      name: 'kefy_active_brand',
      value: 'brand-test-1',
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    },
  ]);
  await setupApiMocks(page);
}

// Fixture de Playwright extendido con auth automático
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page, baseURL }, use) => {
    await setupAuthenticatedState(page, baseURL ?? 'http://localhost:3097');
    await use(page);
  },
});

export { setupApiMocks, setupAuthenticatedState };
export { expect } from '@playwright/test';
