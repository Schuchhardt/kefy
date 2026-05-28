import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mocks de módulos que usan APIs del browser o de Next.js
vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/es/dashboard'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    <img src={src} alt={alt} {...props} />,
}));

vi.mock('@/lib/theme-context', () => ({
  useTheme: vi.fn().mockReturnValue({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('@/components/dashboard/BrandSwitcher', () => ({
  default: () => <div data-testid="brand-switcher" />,
}));

// Mockear fetch global para el efecto de mensajes no leídos
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ threads: [], comments: [] }),
});
vi.stubGlobal('fetch', mockFetch);

import DashboardSidebar from '@/components/dashboard/Sidebar';
import React from 'react';

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [], comments: [] }),
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
    expect(screen.getByText('Automatizaciones')).toBeInTheDocument();
  });

  it('muestra etiquetas en inglés para lang="en"', () => {
    render(<DashboardSidebar lang="en" />);
    expect(screen.getByText('My Brand')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Automations')).toBeInTheDocument();
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
});
