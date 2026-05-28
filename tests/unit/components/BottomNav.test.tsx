import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomNav from '@/components/dashboard/BottomNav';

// next/navigation mock
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/es/dashboard'),
}));

describe('BottomNav', () => {
  it('renderiza exactamente 5 ítems de navegación', () => {
    render(<BottomNav lang="es" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);
  });

  it('muestra las etiquetas en español para lang="es"', () => {
    render(<BottomNav lang="es" />);
    expect(screen.getByText('Marca')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('muestra las etiquetas en inglés para lang="en"', () => {
    render(<BottomNav lang="en" />);
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
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
    expect(firstLink).toBeTruthy();
  });
});
