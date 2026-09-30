import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GoogleFontSelect from '@/components/ui/GoogleFontSelect';

// ─── Selector de fuentes ─────────────────────────────────────────────────────
// Antes solo se podía usar con el ratón: ahora es un combobox con lista, que
// se recorre con las flechas, se elige con Enter y se cierra con Escape.

// El componente carga la hoja de Google Fonts una vez por documento; aquí no
// hace falta (y happy-dom intentaría descargarla).
beforeAll(() => {
  const link = document.createElement('link');
  link.id = 'kefy-google-font-options';
  document.head.appendChild(link);
});

function setup(value: string | null = 'Inter', lang: 'es' | 'en' = 'es') {
  const onChange = vi.fn();
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <label htmlFor="font">Fuente de títulos</label>
      <GoogleFontSelect id="font" lang={lang} value={value} onChange={onChange} previewText="Titulares" />
    </form>,
  );
  const trigger = screen.getByRole('button', { name: 'Fuente de títulos' });
  return { onChange, onSubmit, trigger };
}

const activeOption = () => {
  const id = screen.getByRole('combobox').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('GoogleFontSelect', () => {
  it('la etiqueta nombra al botón y el valor elegido va en la descripción', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAccessibleDescription(/Inter/);
  });

  it('se abre con el buscador enfocado y la opción elegida activa', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    const search = screen.getByRole('combobox', { name: 'Buscar fuente' });
    expect(search).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /^Inter/ })).toHaveAttribute('aria-selected', 'true');
    expect(activeOption()).toHaveTextContent('Inter');
  });

  it('las flechas mueven la opción activa y Enter la elige sin enviar el formulario', () => {
    const { trigger, onChange, onSubmit } = setup();
    fireEvent.click(trigger);
    const search = screen.getByRole('combobox');

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const next = activeOption()?.textContent ?? '';
    expect(next).not.toContain('Inter');
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(activeOption()).toHaveTextContent('Inter');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(next).toContain(onChange.mock.calls[0][0]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('buscar filtra la lista y anuncia cuántas hay; Escape cierra sin cambiar nada', () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    const search = screen.getByRole('combobox');
    fireEvent.change(search, { target: { value: 'playfair' } });

    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Playfair Display');
    expect(screen.getByText('1 fuente')).toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('sin resultados lo dice', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No se encontraron fuentes.')).toBeInTheDocument();
  });

  it('«Sin fuente» vuelve a null', () => {
    const { trigger, onChange } = setup();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Sin fuente/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('en inglés', () => {
    const { trigger } = setup(null, 'en');
    expect(trigger).toHaveAccessibleDescription(/Google Fonts/);
    fireEvent.click(trigger);
    expect(screen.getByRole('combobox', { name: 'Search fonts' })).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /No font/ })).toHaveAttribute('aria-selected', 'true');
  });
});
