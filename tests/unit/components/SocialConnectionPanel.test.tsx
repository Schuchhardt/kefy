import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// El enlace directo `?connect=<red>&brand=<id>` lo devuelven el asistente, la
// API y el MCP. Estos tests fijan que el panel de ajustes lo convierta en el
// mismo flujo que el botón de conectar, una sola vez y con la marca correcta.

const replace = vi.fn();
const router = { replace, push: vi.fn() };
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/es/dashboard/settings',
  useSearchParams: () => currentParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/ui/ChannelIcon', () => ({ default: () => null }));

const brands = [
  { id: 'brand-1', org_id: 'org-1', name: 'Café Andes', slug: 'cafe-andes', avatar_url: null, archived: false, created_at: '', updated_at: '' },
  { id: 'brand-2', org_id: 'org-1', name: 'Panadería Sur', slug: 'panaderia-sur', avatar_url: null, archived: false, created_at: '', updated_at: '' },
];

const calls: string[] = [];
const switchBrand = vi.fn(async (id: string) => { calls.push(`switch:${id}`); });
let brandState = { brands, activeBrand: brands[0], loading: false };

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ ...brandState, switchBrand, canCreate: false, createBrand: vi.fn(), refresh: vi.fn() }),
}));

import SocialConnectionPanel from '@/components/dashboard/SocialConnectionPanel';

// ─── Utilidades ───────────────────────────────────────────────────────────────

const OAUTH_URL = 'https://zernio.example/connect/instagram?x=1';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith('/api/social/oauth/url')) {
    calls.push(`oauth:${url}`);
    return jsonResponse(200, { url: OAUTH_URL, state: 's' });
  }
  return jsonResponse(200, { accounts: [] });
});

function oauthCalls() {
  return fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/social/oauth/url'));
}

const originalLocation = window.location;
let hrefSet: string[] = [];

function renderPanel(query: string, { locale = 'es' as 'es' | 'en', autoConnect = true, strict = false } = {}) {
  currentParams = new URLSearchParams(query);
  const panel = <SocialConnectionPanel locale={locale} mode="settings" autoConnectFromQuery={autoConnect} />;
  return render(strict ? <StrictMode>{panel}</StrictMode> : panel);
}

beforeEach(() => {
  calls.length = 0;
  hrefSet = [];
  replace.mockClear();
  switchBrand.mockClear();
  fetchMock.mockClear();
  brandState = { brands, activeBrand: brands[0], loading: false };
  vi.stubGlobal('fetch', fetchMock);
  // Sustituye window.location para registrar la redirección a Zernio sin navegar.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...originalLocation,
      origin: 'http://localhost',
      get href() { return hrefSet.at(-1) ?? 'http://localhost/es/dashboard/settings'; },
      set href(v: string) { hrefSet.push(v); },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SocialConnectionPanel — enlace directo ?connect=', () => {
  it('pide la URL de OAuth de la red y redirige a ella', async () => {
    renderPanel('connect=instagram');

    await waitFor(() => expect(hrefSet).toEqual([OAUTH_URL]));
    const [url] = oauthCalls();
    expect(url).toMatch(/^\/api\/social\/oauth\/url\?platform=instagram&/);
    // Vuelve a ajustes sin el parámetro `connect`.
    expect(url).toContain(`returnTo=${encodeURIComponent('/es/dashboard/settings')}`);
    expect(screen.getByRole('status')).toHaveTextContent('Conectando Instagram…');
  });

  it('muestra el estado en inglés', async () => {
    renderPanel('connect=instagram', { locale: 'en' });
    expect(await screen.findByRole('status')).toHaveTextContent('Connecting Instagram…');
  });

  it('cambia a la marca del enlace antes de pedir la URL de OAuth', async () => {
    renderPanel('connect=linkedin&brand=brand-2');

    await waitFor(() => expect(hrefSet).toHaveLength(1));
    expect(switchBrand).toHaveBeenCalledWith('brand-2');
    expect(calls[0]).toBe('switch:brand-2');
    expect(calls[1]).toMatch(/^oauth:\/api\/social\/oauth\/url\?platform=linkedin&/);
  });

  it('no cambia de marca si la del enlace ya es la activa', async () => {
    renderPanel('connect=instagram&brand=brand-1');
    await waitFor(() => expect(hrefSet).toHaveLength(1));
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it('espera a que carguen las marcas antes de validar la del enlace', async () => {
    brandState = { brands: [], activeBrand: null as unknown as typeof brands[0], loading: true };
    const view = renderPanel('connect=instagram&brand=brand-2');

    await new Promise((r) => setTimeout(r, 20));
    expect(oauthCalls()).toHaveLength(0);
    expect(screen.queryByText(/no está entre tus marcas/)).not.toBeInTheDocument();

    brandState = { brands, activeBrand: brands[0], loading: false };
    view.rerender(<SocialConnectionPanel locale="es" mode="settings" autoConnectFromQuery />);

    await waitFor(() => expect(hrefSet).toHaveLength(1));
    expect(calls[0]).toBe('switch:brand-2');
  });

  it('marca que no es del usuario: error y no conecta', async () => {
    renderPanel('connect=instagram&brand=brand-ajena');

    expect(await screen.findByText(/La marca del enlace no está entre tus marcas/)).toBeInTheDocument();
    expect(switchBrand).not.toHaveBeenCalled();
    expect(oauthCalls()).toHaveLength(0);
    expect(hrefSet).toHaveLength(0);
  });

  it('si falla el cambio de marca no pide la URL de OAuth', async () => {
    switchBrand.mockRejectedValueOnce(new Error('Forbidden'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPanel('connect=instagram&brand=brand-2');

    expect(await screen.findByText(/No se pudo cambiar a la marca del enlace/)).toBeInTheDocument();
    expect(oauthCalls()).toHaveLength(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('red desconocida: error y no conecta', async () => {
    renderPanel('connect=myspace');

    expect(await screen.findByText(/apunta a una red que Kefy no admite/)).toBeInTheDocument();
    expect(oauthCalls()).toHaveLength(0);
    expect(hrefSet).toHaveLength(0);
  });

  it('se ejecuta una sola vez, también en StrictMode y con re-renders', async () => {
    const view = renderPanel('connect=instagram', { strict: true });
    await waitFor(() => expect(hrefSet).toHaveLength(1));

    view.rerender(
      <StrictMode>
        <SocialConnectionPanel locale="es" mode="settings" autoConnectFromQuery />
      </StrictMode>,
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(oauthCalls()).toHaveLength(1);
    expect(hrefSet).toHaveLength(1);
  });

  it('quita connect y brand de la URL y conserva el resto', async () => {
    renderPanel('connect=instagram&brand=brand-2&tab=social');

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/es/dashboard/settings?tab=social');
  });

  it('quita los parámetros también cuando el enlace es inválido', async () => {
    renderPanel('connect=myspace');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/es/dashboard/settings'));
  });

  it('sin autoConnectFromQuery (panel del inicio) no hace nada', async () => {
    renderPanel('connect=instagram&brand=brand-2', { autoConnect: false });

    await new Promise((r) => setTimeout(r, 20));
    expect(oauthCalls()).toHaveLength(0);
    expect(switchBrand).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sigue mostrando la vuelta del OAuth (?connected=)', async () => {
    renderPanel('connected=instagram');

    expect(await screen.findByText(/Instagram conectado correctamente/)).toBeInTheDocument();
    expect(oauthCalls()).toHaveLength(0);
    expect(replace).toHaveBeenCalledWith('/es/dashboard/settings');
  });
});
