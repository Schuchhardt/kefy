import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // Un solo worker también en local. El servidor de desarrollo compila cada
  // ruta bajo demanda la primera vez que se pide, y con varios workers
  // golpeándolo a la vez las compilaciones no entran en el timeout: la suite
  // fallaba en paralelo y pasaba entera al ejecutarla en serie.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3097',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'npx next start -p 3097'
      : 'npx next dev -p 3097',
    url: 'http://localhost:3097',
    env: {
      ...(process.env as Record<string, string>),
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
