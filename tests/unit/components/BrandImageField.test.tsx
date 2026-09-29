import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Brand } from '@/lib/brand-context';

// ─── Imagen de la marca ──────────────────────────────────────────────────────
// Nombre accesible del campo de archivo y del botón, estados de subida en una
// región role="status" y errores visibles (antes el error de subida era un
// texto rojo sin anunciar).

const brand: Brand = {
  id: 'b1', org_id: 'o1', name: 'Acme', slug: 'acme', avatar_url: null, kit_logo_url: null,
  archived: false, created_at: '', updated_at: '',
};
const state = { activeBrand: brand as Brand | null };
const refresh = vi.fn(async () => {});
vi.mock('@/lib/brand-context', () => ({ useBrand: () => ({ activeBrand: state.activeBrand, refresh }) }));

import BrandImageField from '@/components/dashboard/BrandImageField';

function file(name: string, type: string, size = 1024) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

let resolveUpload: (res: Response) => void = () => {};
const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
  new Promise<Response>((resolve) => { resolveUpload = resolve; }));

beforeEach(() => {
  state.activeBrand = { ...brand };
  refresh.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('BrandImageField', () => {
  it('el campo de archivo y el botón tienen nombre, y el botón explica formatos y tamaño', () => {
    render(<BrandImageField locale="es" />);
    expect(screen.getByRole('heading', { name: 'Imagen de la marca' })).toBeInTheDocument();
    expect(screen.getByLabelText('Archivo de la imagen de la marca')).toHaveAttribute('type', 'file');
    const button = screen.getByRole('button', { name: 'Subir imagen' });
    expect(button).toHaveAccessibleDescription(/JPG, PNG o WebP · máximo 5 MB\./);
  });

  it('un formato no admitido se avisa con role="alert" y no se sube', () => {
    render(<BrandImageField locale="es" />);
    fireEvent.change(screen.getByLabelText('Archivo de la imagen de la marca'), { target: { files: [file('a.gif', 'image/gif')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Formato no admitido. Usa JPG, PNG o WebP.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('una imagen de más de 5 MB se avisa', () => {
    render(<BrandImageField locale="en" />);
    fireEvent.change(screen.getByLabelText('Brand image file'), { target: { files: [file('a.png', 'image/png', 6 * 1024 * 1024)] } });
    expect(screen.getByRole('alert')).toHaveTextContent('The image is larger than 5 MB.');
  });

  it('anuncia «Subiendo…» y después «Imagen actualizada»', async () => {
    render(<BrandImageField locale="es" />);
    fireEvent.change(screen.getByLabelText('Archivo de la imagen de la marca'), { target: { files: [file('a.png', 'image/png')] } });

    expect(await screen.findByText('Subiendo imagen…')).toBeInTheDocument();
    expect(screen.getByText('Subiendo imagen…').closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeDisabled();

    resolveUpload({ ok: true, status: 200, json: async () => ({}) } as Response);
    await waitFor(() => expect(screen.getByText('Imagen actualizada.')).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('si la subida falla, lo dice en el idioma de la app', async () => {
    render(<BrandImageField locale="es" />);
    fireEvent.change(screen.getByLabelText('Archivo de la imagen de la marca'), { target: { files: [file('a.png', 'image/png')] } });
    await screen.findByText('Subiendo imagen…');
    resolveUpload({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos subir la imagen. Inténtalo de nuevo.');
  });

  it('con imagen propia ofrece cambiarla o quitarla', () => {
    state.activeBrand = { ...brand, avatar_url: 'https://cdn.test/a.png' };
    render(<BrandImageField locale="es" />);
    expect(screen.getByRole('button', { name: 'Cambiar imagen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeInTheDocument();
  });

  it('sin marca activa no pinta nada', () => {
    state.activeBrand = null;
    const { container } = render(<BrandImageField locale="es" />);
    expect(container).toBeEmptyDOMElement();
  });
});
