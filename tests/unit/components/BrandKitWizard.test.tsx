import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BrandKit } from '@/types/brand-kit';

// ─── Completa tu marca (BrandKitWizard) ──────────────────────────────────────
// 5 pantallas en vez de 20 pasos: retoma en la primera incompleta, guarda solo
// lo que cambió, «Terminar más tarde» guarda y sale, y las sugerencias con IA
// (1 crédito) solo se piden con el botón.

const refreshBrands = vi.fn(async () => {});
vi.mock('@/lib/brand-context', () => ({ useBrand: () => ({ activeBrand: null, refresh: refreshBrands }) }));

import BrandKitWizard from '@/components/dashboard/BrandKitWizard';

const KIT: BrandKit = {
  id: 'k1', org_id: 'o1', name: 'Café Andes', tagline: null, industry: 'Cafetería', website_url: null,
  social_urls: {}, language: 'es', customer_locations: [], uses_emojis: false,
  communication_style: null, mission: 'Café de especialidad', tone: [], primary_color: null,
  secondary_color: null, accent_color: null, font_heading: null, font_body: null, logo_url: null,
  notes: null, company_size: null, differentiators: [], challenges: [], niche: null, competitors: [],
  target_audience: null, created_at: '', updated_at: '',
};

function json(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

let serverKit: BrandKit;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('/api/brand-kit?') && init?.method === 'PATCH') {
    serverKit = { ...serverKit, ...JSON.parse(String(init.body)) };
    return json({ kit: serverKit });
  }
  if (url === '/api/brand-kit') return json({ kit: serverKit });
  if (url === '/api/brand-kit/ai-suggest') return json({ suggestions: ['Cercano y directo', 'Experto sin tecnicismos'] });
  return json({});
});

const patches = () => fetchMock.mock.calls
  .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
  .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);

beforeEach(() => {
  serverKit = { ...KIT };
  fetchMock.mockClear();
  refreshBrands.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderWizard(props: Partial<Parameters<typeof BrandKitWizard>[0]> = {}) {
  const onComplete = vi.fn();
  const onExit = vi.fn();
  render(<BrandKitWizard locale="es" onComplete={onComplete} onExit={onExit} {...props} />);
  return { onComplete, onExit };
}

describe('BrandKitWizard', () => {
  it('retoma en la primera pantalla incompleta (el negocio ya está)', async () => {
    renderWizard();
    expect(await screen.findByText('Paso 2 de 5: Tu voz')).toBeInTheDocument();
    // La lista de pasos marca el primero como completo.
    expect(screen.getByRole('button', { name: /Tu negocio \(completo\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tu voz \(pendiente\)/ })).toHaveAttribute('aria-current', 'step');
  });

  it('no pide sugerencias solo: únicamente con el botón que dice lo que cuesta', async () => {
    renderWizard();
    await screen.findByText('Paso 2 de 5: Tu voz');
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/brand-kit/ai-suggest')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sugerir estilo de comunicación con IA (1 crédito)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cercano y directo' }));
    expect(screen.getByLabelText('Estilo de comunicación')).toHaveValue('Cercano y directo');
  });

  it('guarda solo lo que cambió y avanza', async () => {
    renderWizard();
    await screen.findByText('Paso 2 de 5: Tu voz');
    fireEvent.click(screen.getByRole('button', { name: 'Amigable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));

    await screen.findByText('Paso 3 de 5: Tu imagen');
    expect(patches()).toEqual([{ tone: ['friendly'] }]);
  });

  it('«Terminar más tarde» guarda lo pendiente y sale', async () => {
    const { onExit, onComplete } = renderWizard();
    await screen.findByText('Paso 2 de 5: Tu voz');
    fireEvent.change(screen.getByLabelText('Eslogan'), { target: { value: 'El café de tu barrio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminar más tarde' }));

    await waitFor(() => expect(onExit).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(patches()).toEqual([{ tagline: 'El café de tu barrio' }]);
  });

  it('valida antes de enviar y lleva a la pantalla del error', async () => {
    renderWizard();
    await screen.findByText('Paso 2 de 5: Tu voz');
    fireEvent.click(screen.getByRole('button', { name: /Tu imagen/ }));
    fireEvent.change(screen.getByLabelText('Color primario'), { target: { value: 'rojo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));

    expect(await screen.findByText('Revisa los campos marcados.')).toBeInTheDocument();
    expect(screen.getByLabelText('Color primario')).toHaveAttribute('aria-invalid', 'true');
    expect(patches()).toHaveLength(0);
  });

  it('en la última pantalla, «Guardar y terminar» completa', async () => {
    serverKit = {
      ...KIT, tone: ['friendly'], communication_style: 'Cercano', primary_color: '#112233',
      font_heading: 'Inter', logo_url: 'https://cdn.example.com/logo.png', target_audience: 'Oficinistas',
      niche: 'Café de especialidad', customer_locations: ['Santiago'],
    };
    const { onComplete } = renderWizard();
    expect(await screen.findByText('Paso 5 de 5: Tu diferencia')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y terminar' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    // Sin cambios no hay PATCH.
    expect(patches()).toHaveLength(0);
  });
});
