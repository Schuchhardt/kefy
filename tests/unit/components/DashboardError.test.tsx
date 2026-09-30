import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Error boundary del dashboard: copy del idioma de la ruta y un reintento que
// llama a `reset` de Next.

let lang = 'es';
vi.mock('next/navigation', () => ({ useParams: () => ({ lang }) }));

import DashboardError from '@/app/[lang]/dashboard/error';

beforeEach(() => { lang = 'es'; });

describe('Error del dashboard', () => {
  it('se anuncia, muestra la referencia y reintenta con reset', () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<DashboardError error={error} reset={reset} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Esta sección falló');
    expect(screen.getByText('Referencia del error: abc123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/es/dashboard');
  });

  it('en inglés usa la copy en inglés', () => {
    lang = 'en';
    render(<DashboardError error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'This section failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/en/dashboard');
  });
});
