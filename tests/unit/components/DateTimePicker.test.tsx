import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateTimePicker from '@/components/dashboard/content/DateTimePicker';

// Auditoría UX 5.3: la hora eran dos <input type="number"> (horas y minutos)
// sin etiqueta visible. En el móvil un <input type="time"> abre el selector
// nativo.

describe('DateTimePicker', () => {
  it('la hora es un campo type="time" con etiqueta, con la hora del valor', () => {
    const value = new Date(2026, 9, 12, 9, 5);
    render(<DateTimePicker value={value} onChange={() => {}} lang="es" />);
    const time = screen.getByLabelText('Hora') as HTMLInputElement;
    expect(time.type).toBe('time');
    expect(time.value).toBe('09:05');
  });

  it('cambiar la hora conserva el día elegido', () => {
    const onChange = vi.fn();
    const value = new Date(2026, 9, 12, 9, 0);
    render(<DateTimePicker value={value} onChange={onChange} lang="es" />);

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '18:45' } });

    const next = onChange.mock.calls[0][0] as Date;
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(9);
    expect(next.getDate()).toBe(12);
    expect(next.getHours()).toBe(18);
    expect(next.getMinutes()).toBe(45);
  });

  it('vaciar el campo no borra la fecha', () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={new Date(2026, 9, 12, 9, 0)} onChange={onChange} lang="es" />);
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('el calendario tiene nombre y muestra el resumen de la fecha elegida', () => {
    render(<DateTimePicker value={new Date(2026, 9, 12, 9, 0)} onChange={() => {}} lang="es" minDate={new Date(2026, 0, 1)} />);
    expect(screen.getByText('Día de publicación')).toBeTruthy();
    expect(screen.getByText(/^Se publicará el lunes, 12 de octubre/)).toBeTruthy();
  });

  it('en inglés', () => {
    render(<DateTimePicker value={new Date(2026, 9, 12, 9, 0)} onChange={() => {}} lang="en" minDate={new Date(2026, 0, 1)} />);
    expect(screen.getByLabelText('Time')).toBeTruthy();
    expect(screen.getByText(/^Goes out on Monday, October 12/)).toBeTruthy();
  });
});
