import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContentActions from '@/components/dashboard/content/ContentActions';

// Acciones de tarjeta: antes medían 28px y su significado dependía del
// `title` (tooltip de ratón). Ahora tienen nombre accesible propio.

describe('<ContentActions />', () => {
  it('cada acción tiene nombre accesible y llama a su handler', () => {
    const onView = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ContentActions lang="es" onView={onView} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver y publicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('con itemLabel, el nombre dice de qué pieza es', () => {
    render(<ContentActions lang="es" itemLabel="Lanzamiento de otoño" onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Editar: Lanzamiento de otoño' })).toBeInTheDocument();
  });

  it('no dispara el clic de la tarjeta que la contiene', () => {
    const onCard = vi.fn();
    render(
      <div onClick={onCard}>
        <ContentActions lang="es" onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onCard).not.toHaveBeenCalled();
  });

  it('está traducido', () => {
    render(<ContentActions lang="en" onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'View & publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
