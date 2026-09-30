import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Lead } from '@/types/leads';

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'es' }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ activeBrand: { id: 'brand-1', name: 'Mi marca' } }),
}));

import LeadsPage from '@/app/[lang]/dashboard/automations/leads/page';

const now = new Date().toISOString();

function lead(id: string, name: string, stage: Lead['stage'], score: number): Lead {
  return {
    id, username: name.toLowerCase().replace(/\s+/g, ''), display_name: name, avatar_url: null,
    channel: 'instagram', stage, score, notes: null, tags: [],
    contacted: false, converted: false,
    first_interaction_at: now, last_interaction_at: now, created_at: now,
  };
}

let leads: Lead[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data } as Response;
}

function setMobile(mobile: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: mobile && q.includes('max-width'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  leads = [lead('l-1', 'Ana López', 'frio', 10), lead('l-2', 'Beto Ruiz', 'caliente', 70)];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/automations/leads?')) return jsonResponse({ leads });
    const id = url.split('/api/automations/leads/')[1];
    if (method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as Partial<Lead>;
      const current = leads.find((l) => l.id === id)!;
      return jsonResponse({ lead: { ...current, ...body } });
    }
    if (method === 'DELETE') return jsonResponse({ ok: true });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Leads — tablero y detalle', () => {
  it('la tarjeta se abre con un botón (teclado) y en escritorio es un panel lateral no modal', async () => {
    setMobile(false);
    render(<LeadsPage />);

    const open = await screen.findByRole('button', { name: 'Ana López' });
    open.focus();
    fireEvent.click(open);

    const panel = await screen.findByRole('dialog', { name: 'Ana López' });
    expect(panel).not.toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(panel).toHaveFocus());

    // Escape con el foco dentro lo cierra y devuelve el foco a la tarjeta.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ana López' })).toHaveFocus());
  });

  it('en móvil el detalle es la hoja inferior del Modal compartido', async () => {
    setMobile(true);
    render(<LeadsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana López' }));

    const sheet = await screen.findByRole('dialog', { name: 'Ana López' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
  });

  it('eliminar pide confirmación con el diálogo de la app, no con window.confirm', async () => {
    setMobile(false);
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    render(<LeadsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana López' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar lead' }));
    const confirmDialog = await screen.findByRole('alertdialog', { name: '¿Eliminar este lead?' });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ana López' })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/automations/leads/l-1' && init?.method === 'DELETE')).toBe(true);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('«Mover a Tibio» pasa el lead a la columna siguiente', async () => {
    setMobile(false);
    render(<LeadsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mover a Tibio' }));

    const warmColumn = await screen.findByRole('region', { name: 'Tibio' });
    await waitFor(() => expect(within(warmColumn).getByRole('button', { name: 'Ana López' })).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ stage: 'tibio' });
  });

  it('la vista de lista hace scroll horizontal y la fila se abre con su botón', async () => {
    setMobile(false);
    render(<LeadsPage />);
    await screen.findByRole('button', { name: 'Ana López' });

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');

    const region = screen.getByRole('region', { name: 'Lista' });
    expect(region).toHaveClass('scroll-x');
    expect(within(region).getByRole('columnheader', { name: 'Última interacción' })).toBeInTheDocument();

    fireEvent.click(within(region).getByRole('button', { name: 'Beto Ruiz' }));
    expect(await screen.findByRole('dialog', { name: 'Beto Ruiz' })).toBeInTheDocument();
  });

  it('sin leads muestra un estado vacío con el siguiente paso', async () => {
    setMobile(false);
    leads = [];
    render(<LeadsPage />);

    expect(await screen.findByText('Aún no tienes leads')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear una regla de respuesta' }))
      .toHaveAttribute('href', '/es/dashboard/automations/engagement');
  });
});
