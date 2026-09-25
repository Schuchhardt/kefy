import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── openAssistant: abrir el asistente con un mensaje ya escrito ─────────────
//
// La página de estrategia (y cualquier otra) llama a openAssistant(draft): el
// widget abre el panel y deja el texto en el compositor, sin enviarlo y sin
// pisar lo que el usuario ya estaba escribiendo.

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/es/dashboard/brand/strategy',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'ana@example.com', name: 'Ana' },
    subscription: { canCreate: true },
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

const brand = { id: 'brand-1', org_id: 'org-1', name: 'Café Andes', slug: 'cafe-andes', avatar_url: null, archived: false, created_at: '', updated_at: '' };
vi.mock('@/lib/brand-context', () => ({ useBrand: () => ({ activeBrand: brand, brands: [brand] }) }));
vi.mock('@/components/dashboard/BrandAvatar', () => ({ default: () => null }));

import AssistantWidget from '@/components/assistant/AssistantWidget';
import { ASSISTANT_OPEN_EVENT, openAssistant } from '@/lib/assistant/open';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 300, status, headers: new Headers(), body: null, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/assistant/usage') return jsonResponse(200, { used: 0, limit: 100, remaining: 100, period: '2026-09' });
    if (url.startsWith('/api/assistant/conversations')) return jsonResponse(200, { conversations: [] });
    return jsonResponse(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const composer = () => screen.getByRole('textbox', { name: 'Pídele algo al asistente…' }) as HTMLTextAreaElement;

describe('openAssistant', () => {
  it('emite el evento con el borrador', () => {
    const seen: unknown[] = [];
    const onOpen = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    openAssistant('Hola');
    window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    expect(seen).toEqual([{ draft: 'Hola' }]);
  });

  it('abre el panel y deja el borrador en el compositor sin enviarlo', async () => {
    render(<AssistantWidget lang="es" />);
    expect(screen.queryByRole('dialog', { name: 'Asistente Kefy' })).toBeNull();

    await act(async () => { openAssistant('Créame una estrategia personalizada para mi marca'); });

    expect(screen.getByRole('dialog', { name: 'Asistente Kefy' })).toBeVisible();
    expect(composer().value).toBe('Créame una estrategia personalizada para mi marca');
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/assistant/chat')).toBe(false);
  });

  it('no pisa lo que el usuario ya estaba escribiendo', async () => {
    render(<AssistantWidget lang="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' }));
    fireEvent.change(composer(), { target: { value: 'Mi pregunta a medias' } });

    await act(async () => { openAssistant('Créame una estrategia'); });

    expect(composer().value).toBe('Mi pregunta a medias');
  });

  it('sin borrador solo abre el panel', async () => {
    render(<AssistantWidget lang="es" />);
    await act(async () => { openAssistant(); });
    expect(screen.getByRole('dialog', { name: 'Asistente Kefy' })).toBeVisible();
    expect(composer().value).toBe('');
  });

  it('el mismo borrador pedido dos veces se vuelve a aplicar si el compositor quedó vacío', async () => {
    render(<AssistantWidget lang="es" />);
    await act(async () => { openAssistant('Uno'); });
    fireEvent.change(composer(), { target: { value: '' } });
    await act(async () => { openAssistant('Uno'); });
    expect(composer().value).toBe('Uno');
  });
});
