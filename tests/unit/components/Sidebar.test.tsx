import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mocks de módulos que usan APIs del browser o de Next.js
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/es/dashboard'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    <img src={src} alt={alt} {...props} />,
}));
/* eslint-enable @next/next/no-img-element */

vi.mock('@/lib/theme-context', () => ({
  useTheme: vi.fn().mockReturnValue({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('@/components/dashboard/BrandSwitcher', () => ({
  default: () => <div data-testid="brand-switcher" />,
}));

vi.mock('@/lib/brand-context', () => ({
  useBrand: vi.fn().mockReturnValue({ activeBrand: { id: 'brand-1', name: 'Mi Marca' } }),
}));

// Mockear fetch global para el contador de mensajes sin responder
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ total: 0 }),
});
vi.stubGlobal('fetch', mockFetch);

import DashboardSidebar from '@/components/dashboard/Sidebar';
import React from 'react';

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0 }),
    });
  });

  it('renderiza el sidebar con los 5 ítems de navegación principales', () => {
    render(<DashboardSidebar lang="es" />);
    // El sidebar tiene links de navegación
    const links = screen.getAllByRole('link');
    // 5 ítems principales + settings = al menos 6 links
    expect(links.length).toBeGreaterThanOrEqual(5);
  });

  it('muestra etiquetas en español', () => {
    render(<DashboardSidebar lang="es" />);
    expect(screen.getByText('Mi marca')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Automatizar')).toBeInTheDocument();
  });

  it('muestra etiquetas en inglés para lang="en"', () => {
    render(<DashboardSidebar lang="en" />);
    expect(screen.getByText('My brand')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Automate')).toBeInTheDocument();
  });

  it('los hrefs de los ítems incluyen el lang', () => {
    render(<DashboardSidebar lang="es" />);
    const links = screen.getAllByRole('link');
    const dashboardLink = links.find(l => l.getAttribute('href') === '/es/dashboard');
    expect(dashboardLink).toBeTruthy();
  });

  it('renderiza el BrandSwitcher', () => {
    render(<DashboardSidebar lang="es" />);
    expect(screen.getByTestId('brand-switcher')).toBeInTheDocument();
  });

  it('publica su ancho en --dashboard-sidebar-w (para el asistente anclado a la izquierda)', () => {
    const root = document.documentElement;
    const { unmount } = render(<DashboardSidebar lang="es" />);
    expect(root.style.getPropertyValue('--dashboard-sidebar-w')).toBe('220px');
    fireEvent.click(screen.getByRole('button', { name: 'Colapsar menú' }));
    expect(root.style.getPropertyValue('--dashboard-sidebar-w')).toBe('64px');
    unmount();
    expect(root.style.getPropertyValue('--dashboard-sidebar-w')).toBe('');
  });

  // El mismo nombre y destino que en el BottomNav (lib/dashboard-nav.ts).
  it('marca la sección activa con aria-current', () => {
    render(<DashboardSidebar lang="es" />);
    const home = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/es/dashboard');
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('ofrece crear contenido como acción principal', () => {
    render(<DashboardSidebar lang="es" />);
    const create = screen.getByRole('link', { name: /Crear contenido/ });
    expect(create.getAttribute('href')).toBe('/es/dashboard/content/create?new=1');
  });

  it('muestra el total de mensajes sin responder en Inbox', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ total: 7 }) });
    render(<DashboardSidebar lang="es" />);
    expect(await screen.findByLabelText('7 mensajes o comentarios sin responder')).toHaveTextContent('7');
    expect(mockFetch).toHaveBeenCalledWith('/api/messaging/summary', expect.anything());
  });
});
