import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { BrandKit } from '@/types/brand-kit';

// ─── Mi marca › Identidad ────────────────────────────────────────────────────
// La barra de guardado (estado siempre visible, botón desactivado sin
// cambios), el PATCH solo de lo que cambió, la validación antes de enviar y
// que las sugerencias con IA (1 crédito) solo se pidan con el botón.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: 'es' }),
  usePathname: () => '/es/dashboard/brand/identity',
}));

const auth = { loading: false, org: { id: 'o1', name: 'Acme', slug: 'acme', plan: 'starter' }, role: 'owner' as string | null };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }));

const refreshBrands = vi.fn(async () => {});
vi.mock('@/lib/brand-context', () => ({ useBrand: () => ({ activeBrand: null, refresh: refreshBrands }) }));

import BrandIdentityPage from '@/app/[lang]/dashboard/brand/identity/page';
import { emitDataChanged } from '@/lib/data-events';

const KIT: BrandKit = {
  id: 'k1', org_id: 'o1', name: 'Acme', tagline: null, industry: 'SaaS', website_url: null,
  social_urls: {}, language: 'es', customer_locations: ['Chile'], uses_emojis: false,
  communication_style: null, mission: null, tone: ['friendly'], primary_color: '#112233',
  secondary_color: null, accent_color: null, font_heading: null, font_body: null, logo_url: null,
  notes: null, company_size: null, differentiators: [], challenges: [], niche: null, competitors: [],
  target_audience: null, created_at: '', updated_at: '',
};

function json(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

let serverKit: BrandKit;
let patchResponse: (body: Record<string, unknown>) => Response;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === '/api/brand-kit' && init?.method === 'PATCH') {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return patchResponse(body);
  }
  if (url === '/api/brand-kit') return json({ kit: serverKit });
  if (url === '/api/brand-kit/ai-suggest') return json({ suggestions: ['Santiago', 'Lima'] });
  return json({});
});

const calls = (pred: (url: string, init?: RequestInit) => boolean) =>
  fetchMock.mock.calls.filter(([u, i]) => pred(String(u), i as RequestInit | undefined));

async function renderLoaded() {
  render(<BrandIdentityPage />);
  const save = await screen.findByRole('button', { name: 'Guardar cambios' });
  return { save };
}

// GoogleFontSelect carga la hoja de Google Fonts; aquí no hace falta.
beforeAll(() => {
  const link = document.createElement('link');
  link.id = 'kefy-google-font-options';
  document.head.appendChild(link);
});

beforeEach(() => {
  auth.role = 'owner';
  serverKit = { ...KIT };
  patchResponse = (body) => {
    serverKit = { ...serverKit, ...body } as BrandKit;
    return json({ kit: serverKit });
  };
  fetchMock.mockClear();
  refreshBrands.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Identidad — barra de guardado', () => {
  it('sin cambios, «Guardar» está desactivado y la barra lo dice', async () => {
    const { save } = await renderLoaded();
    expect(save).toBeDisabled();
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
    expect(screen.getByText('Sin cambios').closest('[role="status"]')).not.toBeNull();
  });

  it('al editar muestra «Cambios sin guardar»; guardar envía solo lo cambiado y termina en «Guardado»', async () => {
    const { save } = await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: 'Eslogan' }), { target: { value: 'Hecho a mano' } });

    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Guardado')).toBeInTheDocument());

    const patches = calls((u, i) => u === '/api/brand-kit' && i?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ tagline: 'Hecho a mano' });
    expect(save).toBeDisabled();
    // Ni el nombre ni el logo cambiaron: el selector de marca no se recarga.
    expect(refreshBrands).not.toHaveBeenCalled();
  });

  it('cambiar el nombre refresca el selector de marca', async () => {
    const { save } = await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la marca' }), { target: { value: 'Acme Café' } });
    fireEvent.click(save);
    await waitFor(() => expect(refreshBrands).toHaveBeenCalledTimes(1));
  });

  it('valida antes de enviar: un color mal escrito se marca, recibe el foco y no hay PATCH', async () => {
    const { save } = await renderLoaded();
    const color = screen.getByRole('textbox', { name: 'Color primario' });
    fireEvent.change(color, { target: { value: '#12' } });
    fireEvent.click(save);

    expect(await screen.findByText('Usa el formato #RRGGBB, por ejemplo #1A2B3C.')).toBeInTheDocument();
    expect(color).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(color);
    expect(screen.getByText('Revisa los campos marcados antes de guardar.')).toBeInTheDocument();
    expect(calls((u, i) => i?.method === 'PATCH')).toHaveLength(0);
  });

  it('el nombre es obligatorio', async () => {
    const { save } = await renderLoaded();
    const name = screen.getByRole('textbox', { name: 'Nombre de la marca' });
    expect(name).toHaveAttribute('aria-required', 'true');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.click(save);
    expect(await screen.findByText('Escribe el nombre de la marca.')).toBeInTheDocument();
    expect(calls((u, i) => i?.method === 'PATCH')).toHaveLength(0);
  });

  it('un 403 se explica en el idioma de la app', async () => {
    patchResponse = () => json({ error: 'Forbidden' }, 403);
    const { save } = await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: 'Eslogan' }), { target: { value: 'X' } });
    fireEvent.click(save);
    const alert = await screen.findByText('Solo el dueño o un administrador de la organización puede editar la marca.');
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('un 422 nombra el campo en español en vez del mensaje en inglés del servidor', async () => {
    patchResponse = () => json({ error: 'primary_color must be a valid hex color (e.g. #FF0000)' }, 422);
    const { save } = await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: 'Eslogan' }), { target: { value: 'X' } });
    fireEvent.click(save);
    expect(await screen.findByText('No se pudo guardar «Color primario»: revisa el valor.')).toBeInTheDocument();
  });
});

describe('Identidad — sugerencias con IA', () => {
  it('no se piden solas: solo con el botón, que dice lo que cuesta', async () => {
    await renderLoaded();
    expect(calls((u) => u === '/api/brand-kit/ai-suggest')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Sugerir con IA \(1 crédito\)/ }));
    expect(await screen.findByRole('button', { name: 'Santiago' })).toBeInTheDocument();

    const suggestCalls = calls((u) => u === '/api/brand-kit/ai-suggest');
    expect(suggestCalls).toHaveLength(1);
    expect(JSON.parse(String(suggestCalls[0][1]?.body))).toMatchObject({ field: 'customer_locations', lang: 'es' });
  });
});

describe('Identidad — recarga por el asistente', () => {
  it('toma lo nuevo del servidor sin perder lo que el usuario estaba editando', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: 'Eslogan' }), { target: { value: 'Mío' } });

    serverKit = { ...serverKit, industry: 'Restaurantes' };
    act(() => { emitDataChanged(['brand-kit']); });

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Industria' })).toHaveValue('Restaurantes'));
    expect(screen.getByRole('textbox', { name: 'Eslogan' })).toHaveValue('Mío');
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });
});

describe('Identidad — sin permiso de edición', () => {
  it('un miembro ve los datos con el formulario desactivado y sin barra de guardado', async () => {
    auth.role = 'member';
    render(<BrandIdentityPage />);
    expect(await screen.findByText(/Solo el dueño o un administrador de la organización puede editar la marca/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Eslogan' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });
});
