import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CustomStrategyPanel from '@/components/dashboard/strategy/CustomStrategyPanel';
import type { CustomStrategy } from '@/types/strategy';

// ─── Panel de estrategias propias ────────────────────────────────────────────
// Borrar pide confirmación con el diálogo de la app (antes un recuadro en la
// página sin gestión de foco), el editor se lleva el foco al abrirse y lo
// devuelve al cerrarse, y un error de carga se puede reintentar.

const MINE: CustomStrategy = {
  id: 'c1', org_id: 'o1', name: 'Mía', description: 'Enfoque propio', objective_id: null, based_on_strategy_id: null,
  kpi_primary: 'Guardados', kpi_secondary: null, cta_mechanic: 'Comenta «YO»',
  calendar: [{ week: 1, format: 'reel', channel: 'tiktok', topic: 'Detrás de cámaras', angle: null, goal: 'Alcance' }],
  created_by: null, created_via: 'chat', updated_via: 'chat', created_at: '', updated_at: '2026-09-01T10:00:00Z',
};

function json(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

let list: CustomStrategy[];
let listStatus: number;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (init?.method === 'DELETE') return json({}, 200);
  if (url.startsWith('/api/strategies/custom')) return listStatus === 200 ? json({ strategies: list }) : json({}, listStatus);
  return json({});
});

function setup(props: Partial<React.ComponentProps<typeof CustomStrategyPanel>> = {}) {
  const handlers = {
    onSelectedIdChange: vi.fn(),
    onSelectionSaved: vi.fn(),
    onSelectionStale: vi.fn(),
    onGenerate: vi.fn(),
  };
  render(
    <CustomStrategyPanel
      lang="es"
      objectives={[]}
      activeCustomId="c1"
      canEdit
      selectedId="c1"
      reloadToken={0}
      prefill={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

beforeEach(() => {
  list = [MINE];
  listStatus = 200;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('CustomStrategyPanel', () => {
  it('muestra la elegida con su calendario y «Generar» con el tema en el nombre', async () => {
    const { onGenerate } = setup();
    const detail = await screen.findByTestId('custom-strategy-detail');
    expect(within(detail).getByRole('heading', { name: 'Mía' })).toBeInTheDocument();
    expect(within(detail).getAllByText('Activa').length).toBeGreaterThan(0);
    fireEvent.click(within(detail).getByRole('button', { name: 'Generar «Detrás de cámaras»' }));
    expect(onGenerate).toHaveBeenCalledWith(MINE.calendar[0]);
  });

  it('borrar pide confirmación en un diálogo; cancelar no borra', async () => {
    setup();
    await screen.findByTestId('custom-strategy-detail');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Eliminar «Mía»?');
    expect(dialog).toHaveTextContent('Es tu estrategia activa');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('confirmar borra y avisa', async () => {
    const { onSelectionStale } = setup();
    await screen.findByTestId('custom-strategy-detail');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, eliminar' }));

    expect(await screen.findByText('Estrategia eliminada')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u, init]) =>
      String(u).startsWith('/api/strategies/custom/c1') && (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true);
    expect(onSelectionStale).toHaveBeenCalled();
  });

  it('sin estrategias, el estado vacío ofrece crear una; el editor toma el foco y lo devuelve al cancelar', async () => {
    list = [];
    setup({ activeCustomId: null, selectedId: null });
    expect(await screen.findByText('Todavía no tienes estrategias personalizadas')).toBeInTheDocument();
    // Las acciones van en el estado vacío, no repetidas en la cabecera.
    expect(screen.getAllByRole('button', { name: 'Nueva estrategia' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nueva estrategia' }));
    const heading = screen.getByRole('heading', { name: 'Nueva estrategia personalizada' });
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    const title = screen.getByRole('heading', { name: 'Tus estrategias personalizadas' });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it('un error de carga se puede reintentar', async () => {
    listStatus = 500;
    setup();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar tus estrategias personalizadas.');

    listStatus = 200;
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('custom-strategy-detail')).toBeInTheDocument();
  });

  it('sin permiso de edición no ofrece editar ni borrar', async () => {
    setup({ canEdit: false });
    await screen.findByTestId('custom-strategy-detail');
    expect(screen.getByText(/Solo el dueño o un administrador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});
