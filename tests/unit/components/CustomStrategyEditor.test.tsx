import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CustomStrategyEditor from '@/components/dashboard/strategy/CustomStrategyEditor';
import { emptyDraft, type CustomDraft } from '@/components/dashboard/strategy/custom-strategy-model';
import type { Objective } from '@/types/strategy';

// ─── Editor de estrategias propias ───────────────────────────────────────────

const OBJECTIVES: Objective[] = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'ventas', name_es: 'Ventas', name_en: 'Sales', desc_es: '', desc_en: '', icon: '💰' },
];

function setup(initial: CustomDraft = emptyDraft(), lang: 'es' | 'en' = 'es') {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <CustomStrategyEditor
      lang={lang}
      mode="create"
      initial={initial}
      objectives={OBJECTIVES}
      saving={false}
      serverError={null}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  return { onSave, onCancel };
}

const rows = () => screen.getAllByTestId('custom-calendar-row');

describe('CustomStrategyEditor — validación', () => {
  it('no guarda sin nombre ni tema y explica por qué', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ponle un nombre a la estrategia.');
    expect(alert).toHaveTextContent('Cada pieza necesita un tema.');
    expect(screen.getByLabelText('Nombre *')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Tema *')).toHaveAttribute('aria-invalid', 'true');
  });

  it('con nombre pero una pieza sin tema tampoco guarda', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Lanzamiento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y activar' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Ponle un nombre');
    expect(screen.getByRole('alert')).toHaveTextContent('Cada pieza necesita un tema.');
  });

  it('guarda con nombre y tema; «Guardar y activar» pide activarla', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Lanzamiento' } });
    fireEvent.change(screen.getByLabelText('Objetivo (opcional)'), { target: { value: OBJECTIVES[0].id } });
    fireEvent.change(screen.getByLabelText('Tema *'), { target: { value: 'Detrás de cámaras' } });
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'reel' } });
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'tiktok' } });
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar y activar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [draft, activate] = onSave.mock.calls[0] as [CustomDraft, boolean];
    expect(activate).toBe(true);
    expect(draft.name).toBe('Lanzamiento');
    expect(draft.objective_id).toBe(OBJECTIVES[0].id);
    expect(draft.calendar).toHaveLength(1);
    expect(draft.calendar[0]).toMatchObject({ week: 3, format: 'reel', channel: 'tiktok', topic: 'Detrás de cámaras' });
  });

  it('«Guardar» (submit) no activa', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Tema *'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][1]).toBe(false);
  });

  it('Cancelar avisa', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('CustomStrategyEditor — calendario', () => {
  it('añade y quita piezas, sin bajar de una', () => {
    setup();
    expect(rows()).toHaveLength(1);
    // Con una sola pieza no se puede quitar.
    expect(screen.queryByRole('button', { name: 'Quitar pieza 1' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Añadir pieza' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir pieza' }));
    expect(rows()).toHaveLength(3);

    fireEvent.change(within(rows()[1]).getByLabelText('Tema *'), { target: { value: 'Segunda' } });
    fireEvent.change(within(rows()[2]).getByLabelText('Tema *'), { target: { value: 'Tercera' } });

    fireEvent.click(screen.getByRole('button', { name: 'Quitar pieza 2' }));
    expect(rows()).toHaveLength(2);
    expect(within(rows()[1]).getByLabelText('Tema *')).toHaveValue('Tercera');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar pieza 1' }));
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Quitar pieza/ })).toBeNull();
  });

  it('una pieza nueva hereda la semana de la anterior', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir pieza' }));
    expect(within(rows()[1]).getByLabelText('Semana')).toHaveValue('4');
  });

  it('ofrece 12 semanas, 4 formatos y el canal general', () => {
    setup();
    expect(within(screen.getByLabelText('Semana')).getAllByRole('option')).toHaveLength(12);
    expect(within(screen.getByLabelText('Formato')).getAllByRole('option').map((o) => o.getAttribute('value')))
      .toEqual(['post', 'carousel', 'reel', 'story']);
    expect(within(screen.getByLabelText('Canal')).getAllByRole('option')[0]).toHaveValue('general');
  });

  it('en inglés', () => {
    const { onSave } = setup(emptyDraft(), 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Give the strategy a name.');
    expect(screen.getByRole('button', { name: '+ Add piece' })).toBeInTheDocument();
  });
});

describe('CustomStrategyEditor — errores del servidor', () => {
  it('muestra el mensaje y los detalles', () => {
    render(
      <CustomStrategyEditor
        lang="es"
        mode="edit"
        initial={emptyDraft()}
        objectives={[]}
        saving={false}
        serverError={{ message: 'Revisa estos campos:', details: ['Nombre: Too big'] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Editar estrategia' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Revisa estos campos:');
    expect(alert).toHaveTextContent('Nombre: Too big');
  });
});
