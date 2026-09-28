import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth-context';
import { BrandProvider } from '@/lib/brand-context';

// Regresión (producción): `hasAccounts`/`brandKitHasData` podían resolver a
// `false` antes de que `/api/content` terminara de traer el contenido real,
// así que el dashboard mostraba brevemente el empty state de "cuenta nueva"
// encima de una cuenta que sí tenía contenido — y luego lo reemplazaba por
// los datos reales. La página no debe mostrar NINGUNA sección de datos hasta
// que las tres cargas (cuentas, brand kit, contenido) hayan terminado.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: 'es' }),
}));

import DashboardPage from '@/app/[lang]/dashboard/page';

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/** A promise plus its resolver, to hold a response open mid-test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('Dashboard — no muestra el empty state de "cuenta nueva" antes de tiempo', () => {
  let contentResponse: ReturnType<typeof deferred<Response>>;

  beforeEach(() => {
    contentResponse = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/auth/me'))         return jsonResponse({ user: { name: 'Seba' }, org: { name: 'Kefy' }, role: 'owner', plan: 'starter' });
      if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts: [] });
      if (url.startsWith('/api/brand-kit'))       return jsonResponse({ kit: {} });
      if (url.startsWith('/api/content?'))        return contentResponse.promise;
      if (url.startsWith('/api/analytics/posts')) return jsonResponse({ data: [] });
      if (url.startsWith('/api/analytics'))       return jsonResponse({ totals: null, top_posts: [] });
      if (url.startsWith('/api/brands/active'))   return jsonResponse({ brand: null });
      if (url.startsWith('/api/brands'))          return jsonResponse({ brands: [], count: 0, limit: 1, canCreate: false });
      return jsonResponse({});
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('mientras /api/content sigue en vuelo, no muestra "Configura tu cuenta" aunque cuentas y brand kit ya resolvieron a vacío', async () => {
    render(<AuthProvider lang="es"><BrandProvider><DashboardPage /></BrandProvider></AuthProvider>);

    // Espera a que las otras dos cargas (cuentas, brand kit) hayan resuelto —
    // ambas a "vacío", que es justo la combinación que antes disparaba el
    // empty state antes de tiempo.
    await waitFor(() => expect(screen.queryByText('Hola, Seba 👋')).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('Configura tu cuenta')).not.toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes contenido publicado.')).not.toBeInTheDocument();

    // Ahora sí llega el contenido real — no vacío.
    contentResponse.resolve(jsonResponse({ items: [{
      id: 'c1', channel: 'linkedin', content_type: 'post', body: 'Un post real',
      image_url: null, video_url: null, status: 'published', published_at: null,
      created_at: new Date().toISOString(),
    }] }));

    await waitFor(() => expect(screen.getByText('Un post real')).toBeInTheDocument());
    expect(screen.queryByText('Configura tu cuenta')).not.toBeInTheDocument();
  });
});
