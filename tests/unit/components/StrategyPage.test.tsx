import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { Objective, Industry, Strategy, StrategyTemplate } from '@/types/strategy';

// ─── Mi marca › Estrategia (pestaña de recomendadas) ────────────────────────
// Pestañas de ARIA que se recorren con las flechas, objetivos como botones
// (antes <div role="button"> sin teclado), el calendario del catálogo
// traducido y con «Generar» que nombra su tema, y una salida clara cuando el
// catálogo no tiene estrategia para el par elegido.

const push = vi.fn();
const lang = { value: 'es' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: lang.value }),
  usePathname: () => '/es/dashboard/brand/strategy',
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ role: 'owner' }) }));

import StrategyPage from '@/app/[lang]/dashboard/brand/strategy/page';

const OBJECTIVES: Objective[] = [
  { id: 'obj1', slug: 'ventas', name_es: 'Ventas', name_en: 'Sales', desc_es: 'Vender más', desc_en: 'Sell more', icon: '💰' },
  { id: 'obj2', slug: 'comunidad', name_es: 'Comunidad', name_en: 'Community', desc_es: 'Crecer', desc_en: 'Grow', icon: '🤝' },
];
const INDUSTRIES: Industry[] = [
  { id: 'ind1', slug: 'food', name_es: 'Restaurantes', name_en: 'Restaurants', icon: '🍽️', desc_es: '' },
];
const STRATEGY: Strategy = {
  id: 's1', framework_slug: 'hvc', framework_name_es: 'Gancho y valor', framework_name_en: 'Hook and value',
  framework_desc_es: 'Desc', framework_desc_en: 'Desc EN', kpi_primary_es: 'Guardados', kpi_primary_en: 'Saves',
  kpi_secondary_es: 'Alcance', kpi_secondary_en: 'Reach', interaction_layers: [], cta_mechanic_es: '', cta_mechanic_en: '',
};
const TEMPLATES: StrategyTemplate[] = [
  { id: 't2', week_num: 2, post_num: 1, format: 'reel', channel_hint: 'tiktok', topic_es: 'Detrás de cámaras', topic_en: 'Behind the scenes', copy_structure_es: '', copy_structure_en: '', goal_es: 'Alcance', goal_en: 'Reach' },
  { id: 't1', week_num: 1, post_num: 1, format: 'carrusel', channel_hint: 'general', topic_es: 'Menú del día', topic_en: 'Daily menu', copy_structure_es: 'Lista', copy_structure_en: 'List', goal_es: 'Guardados', goal_en: 'Saves' },
];

function json(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

let selection: Record<string, unknown> | null;
let recommend: { strategy: Strategy | null; templates: StrategyTemplate[] };
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === '/api/strategies') return json({ objectives: OBJECTIVES, industries: INDUSTRIES });
  if (url === '/api/strategies/org') return json({ selection });
  if (url.startsWith('/api/strategies/recommend')) return json(recommend);
  if (url.startsWith('/api/automations/engagement/packs')) return json({ packs: [] });
  if (url.startsWith('/api/strategies/custom')) return json({ strategies: [] });
  return json({});
});

beforeEach(() => {
  lang.value = 'es';
  selection = { objective_id: 'obj1', industry_id: 'ind1', strategy_id: 's1', custom_strategy_id: null, custom_notes: null };
  recommend = { strategy: STRATEGY, templates: TEMPLATES };
  push.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Estrategia — pestañas', () => {
  it('son pestañas de ARIA con foco itinerante y se recorren con las flechas', async () => {
    render(<StrategyPage />);
    const catalog = await screen.findByRole('tab', { name: /Recomendadas/ });
    const custom = screen.getByRole('tab', { name: /Personalizadas/ });
    expect(catalog).toHaveAttribute('aria-selected', 'true');
    expect(catalog).toHaveAttribute('tabindex', '0');
    expect(custom).toHaveAttribute('tabindex', '-1');

    catalog.focus();
    fireEvent.keyDown(catalog, { key: 'ArrowRight' });
    expect(custom).toHaveAttribute('aria-selected', 'true');
    expect(custom).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'strategy-tab-custom');

    fireEvent.keyDown(custom, { key: 'Home' });
    expect(catalog).toHaveAttribute('aria-selected', 'true');
    expect(catalog).toHaveFocus();
  });
});

describe('Estrategia — recomendadas', () => {
  it('los objetivos son botones con aria-pressed', async () => {
    render(<StrategyPage />);
    const ventas = await screen.findByRole('button', { name: /Ventas/ });
    const comunidad = screen.getByRole('button', { name: /Comunidad/ });
    expect(ventas).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(comunidad);
    expect(comunidad).toHaveAttribute('aria-pressed', 'true');
    expect(ventas).toHaveAttribute('aria-pressed', 'false');
  });

  it('el calendario va por semanas, traduce el formato y «Generar» nombra su tema', async () => {
    render(<StrategyPage />);
    const table = await screen.findByRole('table', { name: '04 — Calendario de 4 semanas' });
    const weeks = within(table).getAllByRole('rowheader').map((th) => th.textContent);
    expect(weeks).toEqual(['Semana 1', 'Semana 2']);
    expect(within(table).getByText('Carrusel')).toBeInTheDocument();
    expect(within(table).getByText('General (cualquier red)')).toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: 'Generar «Menú del día»' }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/es/dashboard/content?'));
    const params = new URLSearchParams(String(push.mock.calls[0][0]).split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({ channel: 'instagram', topic: 'Menú del día', type: 'carousel' });
  });

  it('en inglés el formato del catálogo también se traduce', async () => {
    lang.value = 'en';
    render(<StrategyPage />);
    const table = await screen.findByRole('table', { name: '04 — 4-week calendar' });
    expect(within(table).getByText('Carousel')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Generate “Daily menu”' })).toBeInTheDocument();
  });

  it('la estrategia guardada lo dice y su botón queda desactivado', async () => {
    render(<StrategyPage />);
    const saved = await screen.findByRole('button', { name: 'Estrategia guardada' });
    expect(saved).toBeDisabled();
    expect(screen.getByText('Esta es la estrategia que guía tus ideas de contenido.')).toBeInTheDocument();
  });

  it('sin estrategia para el par, ofrece crear una propia con el objetivo ya elegido', async () => {
    recommend = { strategy: null, templates: [] };
    render(<StrategyPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear una personalizada' }));

    expect(screen.getByRole('tab', { name: /Personalizadas/ })).toHaveAttribute('aria-selected', 'true');
    const heading = await screen.findByRole('heading', { name: 'Nueva estrategia personalizada' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('combobox', { name: 'Objetivo (opcional)' })).toHaveValue('obj1');
  });

  it('sin industria, lleva a Mercado', async () => {
    selection = { objective_id: 'obj1', industry_id: null, strategy_id: null, custom_strategy_id: null, custom_notes: null };
    render(<StrategyPage />);
    const link = await screen.findByRole('link', { name: 'Ir a Mercado' });
    expect(link).toHaveAttribute('href', '/es/dashboard/brand/market');
    expect(screen.getByText('Define tu industria para ver la estrategia recomendada.')).toBeInTheDocument();
  });
});
