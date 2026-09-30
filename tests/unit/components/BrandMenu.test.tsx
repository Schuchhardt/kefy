import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

// ─── Selector de marca ────────────────────────────────────────────────────────
//
// BrandMenu lo comparten el sidebar y la barra superior en móvil. Cada marca es
// un botón con el nombre una sola vez (el avatar no lo repite) y la activa se
// marca con aria-current; el trigger del sidebar dice qué hace.

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(); }}>{children}</a>
  ),
}));

const brands = [
  { id: 'brand-1', org_id: 'org-1', name: 'Café Andes', slug: 'cafe-andes', avatar_url: null, archived: false, created_at: '', updated_at: '' },
  { id: 'brand-2', org_id: 'org-1', name: 'Panadería Sur', slug: 'panaderia-sur', avatar_url: 'https://cdn/logo.webp', archived: false, created_at: '', updated_at: '' },
];

const switchBrand = vi.fn(async () => {});
const createBrand = vi.fn(async () => brands[0]);
let canCreate = true;

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ brands, activeBrand: brands[0], loading: false, canCreate, switchBrand, createBrand, refresh: vi.fn() }),
}));

import BrandMenu from '@/components/dashboard/BrandMenu';
import BrandSwitcher from '@/components/dashboard/BrandSwitcher';

beforeEach(() => {
  canCreate = true;
  switchBrand.mockClear();
  createBrand.mockClear();
});

describe('BrandMenu', () => {
  it('cada marca se anuncia una sola vez y la activa lleva aria-current', () => {
    render(<BrandMenu lang="es" onDone={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Tus marcas' });
    const active = within(list).getByRole('button', { name: 'Café Andes' });
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'Panadería Sur' })).not.toHaveAttribute('aria-current');
  });

  it('cambiar de marca llama al contexto y cierra', async () => {
    const onDone = vi.fn();
    render(<BrandMenu lang="es" onDone={onDone} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Panadería Sur' })); });
    expect(switchBrand).toHaveBeenCalledWith('brand-2');
    expect(onDone).toHaveBeenCalled();
  });

  it('crear una marca: el campo tiene nombre accesible y Enter envía', async () => {
    const onDone = vi.fn();
    render(<BrandMenu lang="en" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'New brand' }));
    const input = screen.getByLabelText('Brand name');
    fireEvent.change(input, { target: { value: '  Nueva  ' } });
    await act(async () => { fireEvent.submit(input.closest('form')!); });
    expect(createBrand).toHaveBeenCalledWith('Nueva');
    expect(onDone).toHaveBeenCalled();
  });

  it('un fallo al crear se muestra en el idioma de la interfaz, no el inglés del servidor', async () => {
    createBrand.mockRejectedValueOnce(new Error('Your plan allows up to 1 brand(s). Upgrade to add more.'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<BrandMenu lang="es" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva marca' }));
    fireEvent.change(screen.getByLabelText('Nombre de la marca'), { target: { value: 'Otra' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Crear' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear la marca.');
    expect(screen.queryByText(/Your plan allows/)).toBeNull();
    spy.mockRestore();
  });

  it('en el límite del plan enlaza a la sección de facturación de Ajustes', () => {
    canCreate = false;
    render(<BrandMenu lang="es" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva marca' }));
    expect(screen.getByRole('link', { name: 'Mejorar plan' })).toHaveAttribute('href', '/es/dashboard/settings#billing');
    expect(screen.getByLabelText('Nombre de la marca')).toBeDisabled();
  });
});

describe('BrandSwitcher', () => {
  it('el trigger dice qué hace y abre la lista; Escape la cierra', () => {
    render(<BrandSwitcher collapsed={false} lang="es" />);
    const trigger = screen.getByRole('button', { name: 'Cambiar de marca (actual: Café Andes)' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Tus marcas' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Tus marcas' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('colapsado solo muestra la marca activa, sin un botón que no hace nada', () => {
    render(<BrandSwitcher collapsed lang="es" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Café Andes' })).toBeInTheDocument();
  });
});
