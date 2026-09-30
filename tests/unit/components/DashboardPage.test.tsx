import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth-context';
import { BrandProvider } from '@/lib/brand-context';

// Home del dashboard.
//
// Regresión (producción): cuentas y brand kit podían resolver a «vacío» antes
// de que /api/content trajera el contenido real, y el home enseñaba un
// instante el estado de «cuenta nueva» encima de una cuenta que sí tenía
// contenido. Nada que dependa de las tres cargas se pinta hasta que terminan.
//
// Además: la lista «Primeros pasos» (que sustituye al modal «Bienvenido») con
// estado real, que se oculta y se recuerda, y el aviso de plan arriba.

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => searchParams,
  useParams: () => ({ lang: 'es' }),
  usePathname: () => '/es/dashboard',
}));

import DashboardPage from '@/app/[lang]/dashboard/page';

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/** Una promesa y su resolución, para dejar una respuesta pendiente. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const POST = {
  id: 'c1', channel: 'linkedin', content_type: 'post', body: 'Un post real',
  image_url: null, video_url: null, status: 'published', published_at: null,
  created_at: new Date().toISOString(),
};

function stubFetch(opts: { content?: Promise<Response> | Response; me?: Record<string, unknown> } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/auth/me')) {
      return jsonResponse({
        user: { id: 'u1', name: 'Seba Schuchhardt' }, org: { name: 'Kefy' }, role: 'owner', plan: 'starter',
        ...opts.me,
      });
    }
    if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts: [] });
    if (url.startsWith('/api/brand-kit'))       return jsonResponse({ kit: {} });
    if (url.startsWith('/api/content?limit=1')) return jsonResponse({ items: [] });
    if (url.startsWith('/api/content?'))        return opts.content ?? jsonResponse({ items: [] });
    if (url.startsWith('/api/analytics/posts')) return jsonResponse({ data: [] });
    if (url.startsWith('/api/analytics'))       return jsonResponse({ totals: null, top_posts: [] });
    if (url.startsWith('/api/brands/active'))   return jsonResponse({ brand: null });
    if (url.startsWith('/api/brands'))          return jsonResponse({ brands: [], count: 0, limit: 1, canCreate: false });
    return jsonResponse({});
  }));
}

function renderPage() {
  return render(<AuthProvider lang="es"><BrandProvider><DashboardPage /></BrandProvider></AuthProvider>);
}

beforeEach(() => {
  replace.mockClear();
  searchParams = new URLSearchParams();
  window.localStorage.clear();
});

// Desmontar antes de restaurar fetch: si no, los efectos pendientes llaman al
// fetch real (localhost:3000) y ensucian la salida con ECONNREFUSED.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Dashboard — no muestra el estado de «cuenta nueva» antes de tiempo', () => {
  it('mientras /api/content sigue en vuelo no hay lista de primeros pasos ni estado vacío', async () => {
    const content = deferred<Response>();
    stubFetch({ content: content.promise });
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Hola, Seba' })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument();
    expect(screen.queryByText('Todavía no tienes contenido.')).not.toBeInTheDocument();

    content.resolve(jsonResponse({ items: [POST] }));

    await waitFor(() => expect(screen.getByText('Un post real')).toBeInTheDocument());
    // Con contenido publicado, «crear posts» y «publicar» ya están hechos.
    expect(await screen.findByText('2 de 4 listos')).toBeInTheDocument();
  });
});

describe('Dashboard — primeros pasos', () => {
  it('en una cuenta nueva, el primer paso lleva al onboarding con el único botón principal', async () => {
    stubFetch();
    renderPage();

    expect(await screen.findByText('0 de 4 listos')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Crear mis 3 posts' });
    expect(cta).toHaveAttribute('href', '/es/onboarding');
    // Los demás pasos llevan enlace, no botón principal.
    expect(screen.getByRole('link', { name: 'Completar mi marca' })).toHaveAttribute('href', '/es/dashboard/brand/setup');
    expect(screen.getByRole('link', { name: 'Conectar redes' })).toHaveAttribute('href', '/es/dashboard/settings#social');
  });

  it('se puede ocultar y no vuelve a aparecer', async () => {
    stubFetch();
    const { unmount } = renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Ocultar la lista de primeros pasos' }));
    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument();
    unmount();

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Hola, Seba' })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument();
  });

  it('los enlaces viejos con ?onboarding=1 van a la página de onboarding', async () => {
    searchParams = new URLSearchParams({ onboarding: '1' });
    stubFetch();
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/es/onboarding'));
  });
});

describe('Dashboard — aviso de plan', () => {
  it('el pago fallido se avisa arriba, antes de los primeros pasos', async () => {
    stubFetch({
      me: {
        subscription: { canCreate: false, reason: 'payment_failed', status: 'past_due', isTrialing: false, trialDaysLeft: null },
      },
    });
    renderPage();

    const notice = await screen.findByText('No pudimos procesar tu pago');
    const steps = await screen.findByText('Primeros pasos');
    // DOCUMENT_POSITION_FOLLOWING: el aviso va antes en el documento.
    expect(notice.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/es/dashboard/settings#billing');
  });
});
