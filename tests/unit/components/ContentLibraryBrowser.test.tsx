import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContentLibraryBrowser from '@/components/dashboard/content/ContentLibraryBrowser';
import type { LibraryItemWithIndustry } from '@/types/content-library';

// «Ideas por industria» (antes «Biblioteca» en el botón y «Librería» en la
// pestaña): filtros con nombre accesible, formato con aria-pressed y error
// con reintento en vez de un «no hay contenido» engañoso.

const idea: LibraryItemWithIndustry = {
  id: 'lib-1',
  industry_id: 'ind-1',
  content_type: 'carousel',
  title: '5 errores al elegir zapatillas',
  body: 'Un carrusel educativo',
  hashtags: [],
  image_url: null,
  image_prompt: null,
  slides: null,
  source: 'seed',
  language: 'es',
  created_at: '2026-01-01T00:00:00Z',
  industry_slug: 'retail',
  industry_name: 'Retail',
  industry_icon: '🛍️',
};

function json(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data } as Response;
}

describe('<ContentLibraryBrowser />', () => {
  let libraryOk: boolean;
  let requests: string[];

  beforeEach(() => {
    libraryOk = true;
    requests = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith('/api/strategies')) return json({ industries: [{ id: 'ind-1', slug: 'retail', name_es: 'Retail', name_en: 'Retail', icon: '🛍️' }] });
      if (url.startsWith('/api/content-library')) return libraryOk ? json({ items: [idea], total: 1 }) : json({ error: 'boom' }, false);
      return json({});
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('elegir una idea la entrega al padre', async () => {
    const onSelect = vi.fn();
    render(<ContentLibraryBrowser lang="es" onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: /5 errores al elegir zapatillas/ }));
    expect(onSelect).toHaveBeenCalledWith(idea);
  });

  it('los filtros tienen nombre y el formato marca el elegido', async () => {
    render(<ContentLibraryBrowser lang="es" onSelect={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Filtrar por industria' })).toBeInTheDocument();

    const carousel = screen.getByRole('button', { name: 'Carrusel' });
    expect(carousel).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(carousel);
    expect(carousel).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(requests.some((u) => u.includes('content_type=carousel'))).toBe(true));
  });

  it('si la carga falla lo dice y permite reintentar', async () => {
    libraryOk = false;
    render(<ContentLibraryBrowser lang="es" onSelect={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las ideas.');

    libraryOk = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /5 errores al elegir zapatillas/ })).toBeInTheDocument();
  });

  it('está traducido', async () => {
    render(<ContentLibraryBrowser lang="en" onSelect={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Filter by industry' })).toBeInTheDocument();
    expect(await screen.findByText('Use as inspiration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carousel' })).toBeInTheDocument();
  });
});
