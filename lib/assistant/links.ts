// ─── Enlaces al dashboard ────────────────────────────────────────────────────
//
// Toda navegación que propone el asistente (open_page, links de un resultado)
// se construye aquí, en el servidor, a partir de una página conocida y unos
// parámetros codificados. El modelo nunca aporta un href: así un contenido
// malicioso no puede hacer que el widget lleve al usuario a otro sitio.

import type { ToolLink } from '@/lib/assistant/types';

// Local y no el de lib/services/errors: este módulo no arrastra código de
// servidor, así el widget también puede importarlo.
const msg = (lang: 'es' | 'en', es: string, en: string): string => (lang === 'en' ? en : es);

export type DashboardPage =
  | 'home'
  | 'content_create'
  | 'content_calendar'
  | 'content_library'
  | 'conversations'
  | 'brand_identity'
  | 'brand_market'
  | 'brand_strategy'
  | 'automations'
  | 'settings';

const PAGES: Record<DashboardPage, { path: string; params: string[] }> = {
  home:             { path: '',                      params: [] },
  content_create:   { path: '/content/create',       params: ['item', 'topic', 'type'] },
  content_calendar: { path: '/content/calendar',     params: [] },
  content_library:  { path: '/content/library',      params: [] },
  conversations:    { path: '/conversations',        params: ['tab', 'thread', 'account'] },
  brand_identity:   { path: '/brand/identity',       params: [] },
  brand_market:     { path: '/brand/market',         params: [] },
  brand_strategy:   { path: '/brand/strategy',       params: ['objective', 'industry', 'custom'] },
  automations:      { path: '/automations/autopilot', params: [] },
  // connect + brand: el panel de redes arranca la conexión de esa red en esa marca.
  settings:         { path: '/settings',             params: ['connect', 'brand'] },
};

export const DASHBOARD_PAGES = Object.keys(PAGES) as DashboardPage[];

/**
 * Href interno del dashboard. Solo se incluyen los parámetros que la página
 * entiende; los `undefined` y vacíos se descartan.
 */
export function buildDashboardHref(
  lang: 'es' | 'en',
  page: DashboardPage,
  params: Record<string, string | undefined> = {},
): string {
  const def = PAGES[page] ?? PAGES.home;
  const search = new URLSearchParams();
  for (const key of def.params) {
    const value = params[key];
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const qs = search.toString();
  return `/${lang}/dashboard${def.path}${qs ? `?${qs}` : ''}`;
}

export function itemLink(lang: 'es' | 'en', id: string): ToolLink {
  return {
    label: msg(lang, 'Abrir contenido', 'Open content'),
    href: buildDashboardHref(lang, 'content_create', { item: id }),
  };
}

export function threadLink(lang: 'es' | 'en', threadId: string, accountId: string): ToolLink {
  return {
    label: msg(lang, 'Abrir conversación', 'Open conversation'),
    href: buildDashboardHref(lang, 'conversations', { tab: 'dms', thread: threadId, account: accountId }),
  };
}

export function calendarLink(lang: 'es' | 'en'): ToolLink {
  return {
    label: msg(lang, 'Ver calendario', 'Open calendar'),
    href: buildDashboardHref(lang, 'content_calendar'),
  };
}
