// ─── Navegación del dashboard: una sola definición ───────────────────────────
//
// Sidebar (escritorio) y BottomNav (móvil) tenían cada uno su diccionario
// NAV_LABELS y no coincidían: «Dashboard / Conversaciones / Automatizaciones»
// en uno y «Home / Chat / Auto» en el otro. «Chat» además se confundía con el
// asistente, que también es un chat. Ahora ambos usan estas rutas y los textos
// de locales/*/dashboard/common.ts (nav).

import type { IconName } from '@/components/ui/icons';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

export type DashboardNavKey = 'home' | 'brand' | 'content' | 'inbox' | 'automations' | 'settings';

export interface DashboardNavItem {
  key: DashboardNavKey;
  href: string;
  label: string;
  icon: IconName;
}

export function dashboardNav(lang: string): {
  main: DashboardNavItem[];
  settings: DashboardNavItem;
  create: { href: string; label: string };
} {
  const t = (lang === 'en' ? enCommon : esCommon).nav;
  const base = `/${lang}/dashboard`;
  return {
    main: [
      { key: 'home', href: base, label: t.home, icon: 'home' },
      { key: 'brand', href: `${base}/brand`, label: t.brand, icon: 'brand' },
      { key: 'content', href: `${base}/content`, label: t.content, icon: 'content' },
      { key: 'inbox', href: `${base}/conversations`, label: t.inbox, icon: 'inbox' },
      { key: 'automations', href: `${base}/automations`, label: t.automations, icon: 'bolt' },
    ],
    settings: { key: 'settings', href: `${base}/settings`, label: t.settings, icon: 'settings' },
    create: { href: `${base}/content/create?new=1`, label: t.create },
  };
}

/** El inicio solo está activo en su ruta exacta; el resto, en toda su sección. */
export function isNavItemActive(item: DashboardNavItem, pathname: string, lang: string): boolean {
  if (item.href === `/${lang}/dashboard`) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
