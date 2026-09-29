import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomNav from '@/components/dashboard/BottomNav';

// next/navigation mock
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/es/dashboard'),
}));

vi.mock('@/lib/brand-context', () => ({
  useBrand: vi.fn().mockReturnValue({ activeBrand: { id: 'brand-1', name: 'Mi Marca' } }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ total: 0 }) });
});

describe('BottomNav', () => {
  it('renderiza exactamente 5 ítems de navegación', () => {
    render(<BottomNav lang="es" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('muestra las etiquetas en español para lang="es"', () => {
    render(<BottomNav lang="es" />);
    // Mismos nombres que el Sidebar: antes decía «Home / Chat / Auto».
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Mi marca')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Automatizar')).toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('muestra las etiquetas en inglés para lang="en"', () => {
    render(<BottomNav lang="en" />);
    expect(screen.getByText('My brand')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Automate')).toBeInTheDocument();
  });

  it('los hrefs incluyen el lang correcto', () => {
    render(<BottomNav lang="es" />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map(l => l.getAttribute('href') ?? '');
    expect(hrefs.every(h => h.startsWith('/es/'))).toBe(true);
  });

  it('aplica clase/estilo activo al ítem dashboard cuando pathname coincide', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/es/dashboard');
    const { container } = render(<BottomNav lang="es" />);
    // El primer link (dashboard) debe estar presente
    const firstLink = container.querySelector('a[href="/es/dashboard"]');
    expect(firstLink).toHaveAttribute('aria-current', 'page');
  });

  // En móvil el Sidebar está oculto: el aviso tiene que vivir aquí.
  it('muestra el aviso de mensajes sin responder en Inbox', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ total: 3 }) });
    render(<BottomNav lang="es" />);
    expect(await screen.findByText('3 mensajes o comentarios sin responder')).toBeInTheDocument();
  });
});
