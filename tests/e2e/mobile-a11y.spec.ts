import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

// ─── Móvil y accesibilidad (docs/auditoria-ux.md, Sprint 5.5) ────────────────
//
// Dos regresiones que la auditoría midió y que es fácil reintroducir:
//
// 1. Scroll horizontal en móvil. La landing medía 687px de ancho a 390px y
//    varias pantallas del dashboard desbordaban por rejillas fijas, `100vh` o
//    `.sr-only` escapándose de contenedores con scroll. Se mide el documento y
//    `.dashboard-main`, que es donde vive el scroll del dashboard.
// 2. Violaciones WCAG 2.x A/AA detectables con axe (contraste, nombres
//    accesibles, roles). Se comprueba con la preferencia de movimiento
//    reducido, así las animaciones de entrada no cuentan colores a medias.
//
// Las pantallas del dashboard usan `authenticatedPage` (cookie firmada + API
// simulada, ver fixtures/auth.ts).

const PUBLIC = [
  '/es', '/en', '/es/precios', '/en/pricing',
  '/es/login', '/en/login', '/es/register', '/es/forgot-password',
];

const DASHBOARD = [
  '/es/dashboard',
  '/es/dashboard/content/create',
  '/es/dashboard/content/calendar',
  '/es/dashboard/content/library',
  '/es/dashboard/brand/identity',
  '/es/dashboard/brand/market',
  '/es/dashboard/brand/strategy',
  '/es/dashboard/brand/setup',
  '/es/dashboard/conversations',
  '/es/dashboard/automations/autopilot',
  '/es/dashboard/automations/engagement',
  '/es/dashboard/automations/leads',
  '/es/dashboard/settings',
  '/es/dashboard/profile',
  '/en/dashboard',
  '/es/onboarding',
];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Píxeles que sobran a lo ancho (0 = sin scroll horizontal). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('.dashboard-main');
    return Math.max(document.documentElement.scrollWidth, main?.scrollWidth ?? 0) - window.innerWidth;
  });
}

/** Violaciones de axe en una forma legible en el fallo del test. */
async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
}

for (const width of [390, 320]) {
  test.describe(`sin scroll horizontal a ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true });

    for (const path of PUBLIC) {
      test(path, async ({ page }) => {
        await open(page, path);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }

    for (const path of DASHBOARD) {
      test(path, async ({ authenticatedPage: page }) => {
        await open(page, path);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe('axe: WCAG 2.x A/AA', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, contextOptions: { reducedMotion: 'reduce' } });

  for (const path of PUBLIC) {
    test(path, async ({ page }) => {
      await open(page, path);
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  for (const colorScheme of ['dark', 'light'] as const) {
    test.describe(`dashboard en tema ${colorScheme === 'dark' ? 'oscuro' : 'claro'}`, () => {
      // Sin preferencia guardada, el dashboard sigue la del sistema.
      test.use({ colorScheme });

      for (const path of DASHBOARD) {
        test(path, async ({ authenticatedPage: page }) => {
          await open(page, path);
          expect(await axeViolations(page)).toEqual([]);
        });
      }
    });
  }
});
