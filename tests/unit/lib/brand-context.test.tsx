import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import { BrandProvider, BrandScopedContent, useBrand } from '@/lib/brand-context';

// Aislamiento entre marcas: las páginas cargan sus datos al montar desde APIs
// que leen la marca activa de la cookie. BrandScopedContent las remonta cuando
// la marca cambia — desde el selector o desde otra pestaña — para que nada
// cargado con la marca anterior siga en pantalla.

const BRANDS = [
  { id: 'b1', org_id: 'o1', name: 'Marca Uno', slug: 'uno', avatar_url: null, archived: false, created_at: '', updated_at: '' },
  { id: 'b2', org_id: 'o1', name: 'Marca Dos', slug: 'dos', avatar_url: null, archived: false, created_at: '', updated_at: '' },
];

let serverBrand = 'b1';
let mounts = 0;

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function Page() {
  const { activeBrand, switchBrand } = useBrand();
  useEffect(() => { mounts += 1; }, []);
  return (
    <div>
      <span data-testid="active">{activeBrand?.id ?? '-'}</span>
      <button onClick={() => { void switchBrand('b2'); }}>cambiar</button>
    </div>
  );
}

function renderTree() {
  return render(<BrandProvider><BrandScopedContent><Page /></BrandScopedContent></BrandProvider>);
}

beforeEach(() => {
  serverBrand = 'b1';
  mounts = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/brands') return jsonResponse({ brands: BRANDS, count: 2, limit: 3, canCreate: true });
    if (url === '/api/brands/active') return jsonResponse({ brand: BRANDS.find((b) => b.id === serverBrand) });
    if (url === '/api/brands/switch') {
      serverBrand = (JSON.parse(String(init?.body)) as { brandId: string }).brandId;
      return jsonResponse({ brand: BRANDS.find((b) => b.id === serverBrand) });
    }
    return jsonResponse({});
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('BrandScopedContent', () => {
  it('la carga inicial de la marca no remonta la página', async () => {
    renderTree();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b1'));
    expect(mounts).toBe(1);
  });

  it('cambiar de marca remonta la página', async () => {
    renderTree();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b1'));
    fireEvent.click(screen.getByRole('button', { name: 'cambiar' }));
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b2'));
    expect(mounts).toBe(2);
  });

  it('si la marca se cambió en otra pestaña, al volver se adopta y se remonta', async () => {
    renderTree();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b1'));
    serverBrand = 'b2';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b2'));
    expect(mounts).toBe(2);
  });

  it('volver a la pestaña sin cambios no remonta', async () => {
    renderTree();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b1'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mounts).toBe(1);
  });
});
