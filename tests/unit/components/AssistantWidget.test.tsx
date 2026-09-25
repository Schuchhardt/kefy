import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SseEvent } from '@/lib/assistant/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
let searchParams = new URLSearchParams();
let pathname = '/es/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

const authRefresh = vi.fn(async () => {});
const authLogout = vi.fn(async () => {});
let authState: {
  user: { id: string; email: string; name: string | null } | null;
  subscription: { canCreate: boolean } | null;
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ ...authState, refresh: authRefresh, logout: authLogout }),
}));

const brand = { id: 'brand-1', org_id: 'org-1', name: 'Café Andes', slug: 'cafe-andes', avatar_url: null, archived: false, created_at: '', updated_at: '' };

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ activeBrand: brand, brands: [brand] }),
}));

vi.mock('@/components/dashboard/BrandAvatar', () => ({ default: () => null }));

import AssistantWidget from '@/components/assistant/AssistantWidget';
import SpendErrorCard from '@/components/assistant/SpendErrorCard';
import { DATA_CHANGED_EVENT } from '@/lib/data-events';
import { setOnboardingVisible } from '@/lib/onboarding-visibility';

// ─── Respuestas falsas ────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    json: async () => body,
  } as unknown as Response;
}

const encoder = new TextEncoder();
const frame = (e: SseEvent) => encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);

/** Un stream SSE que el test alimenta a mano, para ver los estados intermedios. */
function controlledSse() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body,
    json: async () => ({}),
  } as unknown as Response;
  return {
    response,
    push: async (e: SseEvent) => { await act(async () => { ctrl.enqueue(frame(e)); await new Promise((r) => setTimeout(r, 0)); }); },
    close: async () => { await act(async () => { ctrl.close(); await new Promise((r) => setTimeout(r, 0)); }); },
    /** Corta el stream con un error (red caída, o AbortError al pulsar Detener). */
    fail: async (err: unknown) => { await act(async () => { ctrl.error(err); await new Promise((r) => setTimeout(r, 0)); }); },
  };
}

/** Un stream SSE ya completo. */
function sseResponse(events: SseEvent[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const e of events) c.enqueue(frame(e)); c.close(); },
  });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body,
    json: async () => ({}),
  } as unknown as Response;
}

const USAGE = { used: 30, limit: 300, remaining: 270, period: '2026-09' };

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let chatHandler: Handler;
let actionHandler: Handler;
/** GET /api/assistant/conversations/{id} */
let conversationHandler: Handler;
/** GET /api/assistant/conversations?limit=… */
let listHandler: Handler;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
let fetchMock: ReturnType<typeof vi.fn>;

function calls(prefix: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u).startsWith(prefix));
}
function bodyOf(call: unknown[]) {
  return JSON.parse(String((call[1] as RequestInit).body));
}

beforeEach(() => {
  router.push.mockReset();
  authRefresh.mockClear();
  authLogout.mockClear();
  searchParams = new URLSearchParams();
  pathname = '/es/dashboard';
  authState = { user: { id: 'user-1', email: 'ana@example.com', name: 'Ana' }, subscription: { canCreate: true } };
  sessionStorage.clear();
  document.body.style.overflow = '';

  chatHandler = () => sseResponse([{ type: 'done', reason: 'end_turn' }]);
  actionHandler = () => sseResponse([{ type: 'done', reason: 'end_turn' }]);
  conversationHandler = () => jsonResponse(200, { messages: [], pendingActions: [] });
  listHandler = () => jsonResponse(200, { conversations: [], usage: null });
  setOnboardingVisible(false);

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/assistant/usage') return jsonResponse(200, USAGE);
    if (url === '/api/assistant/chat') return chatHandler(url, init);
    if (url.startsWith('/api/assistant/actions/')) return actionHandler(url, init);
    if (url.startsWith('/api/assistant/conversations/')) return conversationHandler(url, init);
    if (url.startsWith('/api/assistant/conversations')) return listHandler(url, init);
    return jsonResponse(404, { error: 'not mocked' });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── Utilidades de interacción ────────────────────────────────────────────────

function openWidget() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' }));
  return screen.getByRole('dialog', { name: 'Asistente Kefy' });
}

async function sendMessage(text: string) {
  const input = screen.getByRole('textbox', { name: 'Pídele algo al asistente…' });
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
}

// ─── Visibilidad, abrir y cerrar ──────────────────────────────────────────────

describe('AssistantWidget — visibilidad', () => {
  it('no se pinta sin usuario', () => {
    authState.user = null;
    const { container } = render(<AssistantWidget lang="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no se pinta durante el onboarding (?onboarding=1)', () => {
    searchParams = new URLSearchParams({ onboarding: '1' });
    const { container } = render(<AssistantWidget lang="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no se pinta mientras el onboarding que se abre solo (cuenta nueva, sin ?onboarding=1) está abierto', () => {
    render(<AssistantWidget lang="es" />);
    expect(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' })).toBeInTheDocument();
    act(() => { setOnboardingVisible(true); });
    expect(screen.queryByRole('button', { name: 'Abrir el asistente de Kefy' })).toBeNull();
    act(() => { setOnboardingVisible(false); });
    expect(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' })).toBeInTheDocument();
  });

  it('en leads se ancla a la izquierda pero a la derecha del sidebar de escritorio', () => {
    pathname = '/es/dashboard/automations/leads';
    render(<AssistantWidget lang="es" />);
    const launcher = screen.getByRole('button', { name: 'Abrir el asistente de Kefy' });
    fireEvent.click(launcher);
    const dialog = screen.getByRole('dialog', { name: 'Asistente Kefy' });
    // Sin `left`/`right` en línea: lo pone la clase, que suma el ancho del sidebar.
    expect(launcher).toHaveClass('assistant-launcher--left');
    expect(dialog).toHaveClass('assistant-panel--left');
    for (const el of [launcher, dialog]) {
      expect(el.style.left).toBe('');
      expect(el.style.right).toBe('');
    }
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).toMatch(/\.assistant-launcher--left,\s*\.assistant-panel--left\s*\{\s*left:\s*calc\(var\(--dashboard-sidebar-w, 0px\) \+ 24px\)/);
  });

  it('muestra solo el lanzador hasta que se abre (el panel no se monta)', () => {
    render(<AssistantWidget lang="es" />);
    const launcher = screen.getByRole('button', { name: 'Abrir el asistente de Kefy' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Sin montar el panel no se pide nada al servidor.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa la copy en inglés con lang="en"', () => {
    render(<AssistantWidget lang="en" />);
    expect(screen.getByRole('button', { name: /assistant/i })).toBeInTheDocument();
  });
});

describe('AssistantWidget — abrir y cerrar', () => {
  it('el lanzador abre el panel y vuelve a cerrarlo', () => {
    render(<AssistantWidget lang="es" />);
    openWidget();

    const launcher = screen.getByRole('button', { name: 'Cerrar el asistente' });
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(sessionStorage.getItem('kefy-assistant-open')).toBe('1');

    fireEvent.click(launcher);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem('kefy-assistant-open')).toBeNull();
  });

  it('el botón Cerrar del encabezado cierra el panel', () => {
    render(<AssistantWidget lang="es" />);
    const dialog = openWidget();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc cierra el panel', () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc con el foco fuera del panel (otro panel de la página) no lo cierra', () => {
    render(
      <>
        <input aria-label="Nota del lead" />
        <AssistantWidget lang="es" />
      </>,
    );
    openWidget();
    const other = screen.getByRole('textbox', { name: 'Nota del lead' });
    other.focus();
    fireEvent.keyDown(other, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Asistente Kefy' })).toBeInTheDocument();
  });

  it('Esc que cancela una composición IME no cierra el panel', () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    const input = screen.getByRole('textbox', { name: 'Pídele algo al asistente…' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(screen.getByRole('dialog', { name: 'Asistente Kefy' })).toBeInTheDocument();
  });

  it('al cerrar con Esc o con la X el foco vuelve al lanzador', () => {
    render(<AssistantWidget lang="es" />);
    let dialog = openWidget();
    const input = within(dialog).getByRole('textbox', { name: 'Pídele algo al asistente…' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' }));

    dialog = openWidget();
    const close = within(dialog).getByRole('button', { name: 'Cerrar' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir el asistente de Kefy' }));
  });

  it('Esc no cierra el panel si hay un modal abierto (body sin scroll)', () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    document.body.style.overflow = 'hidden';
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Asistente Kefy' })).toBeInTheDocument();
  });

  it('la conversación sobrevive a cerrar y reabrir el panel', async () => {
    chatHandler = () => sseResponse([
      { type: 'message_start', conversationId: 'conv-1', turnId: 't1' },
      { type: 'text_delta', text: 'Respuesta guardada' },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Hola');
    await screen.findByText('Respuesta guardada');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el asistente' }));
    openWidget();
    expect(screen.getByText('Respuesta guardada')).toBeInTheDocument();
  });

  it('se reabre al recargar si estaba abierto en esta pestaña', async () => {
    sessionStorage.setItem('kefy-assistant-open', '1');
    render(<AssistantWidget lang="es" />);
    expect(await screen.findByRole('dialog', { name: 'Asistente Kefy' })).toBeInTheDocument();
  });

  it('muestra los mensajes que quedan este mes', async () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    expect(await screen.findByText('270 / 300 mensajes')).toBeInTheDocument();
  });
});

// ─── Enviar ───────────────────────────────────────────────────────────────────

describe('AssistantWidget — enviar mensajes', () => {
  it('manda el mensaje con marca, idioma, página y zona horaria, y pinta la respuesta en markdown', async () => {
    chatHandler = () => sseResponse([
      { type: 'message_start', conversationId: 'conv-1', turnId: 't1' },
      { type: 'text_delta', text: 'Hola, ' },
      { type: 'text_delta', text: '**Ana**' },
      { type: 'done', reason: 'end_turn', usage: { used: 31, limit: 300, remaining: 269 } },
    ]);
    pathname = '/es/dashboard/content/calendar';
    render(<AssistantWidget lang="es" />);
    const dialog = openWidget();

    await sendMessage('  ¿Qué tengo programado?  ');

    const [call] = calls('/api/assistant/chat');
    const body = bodyOf(call);
    expect(body).toMatchObject({
      message: '¿Qué tengo programado?',
      brandId: 'brand-1',
      language: 'es',
      page: '/es/dashboard/content/calendar',
    });
    expect(body.conversationId).toBeUndefined();
    expect(typeof body.timezone).toBe('string');
    expect((call[1] as RequestInit).method).toBe('POST');

    expect(within(dialog).getByText('¿Qué tengo programado?')).toBeInTheDocument();
    const strong = await within(dialog).findByText('Ana');
    expect(strong.tagName).toBe('STRONG');
    expect(await within(dialog).findByText('269 / 300 mensajes')).toBeInTheDocument();
    // El compositor se vacía tras enviar.
    expect(screen.getByRole('textbox', { name: 'Pídele algo al asistente…' })).toHaveValue('');
  });

  it('el siguiente mensaje sigue la conversación creada por message_start', async () => {
    chatHandler = () => sseResponse([
      { type: 'message_start', conversationId: 'conv-42', turnId: 't1' },
      { type: 'text_delta', text: 'Ok' },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();

    await sendMessage('Primero');
    await screen.findByText('Ok');
    expect(sessionStorage.getItem('kefy-assistant-conversation')).toBe('conv-42');

    await sendMessage('Segundo');
    await waitFor(() => expect(calls('/api/assistant/chat')).toHaveLength(2));
    expect(bodyOf(calls('/api/assistant/chat')[1]).conversationId).toBe('conv-42');
  });

  it('Shift+Enter no envía', async () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    const input = screen.getByRole('textbox', { name: 'Pídele algo al asistente…' });
    fireEvent.change(input, { target: { value: 'línea 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(calls('/api/assistant/chat')).toHaveLength(0);
  });

  it('no envía mensajes vacíos', async () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('   ');
    expect(calls('/api/assistant/chat')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('una sugerencia del estado vacío se envía como mensaje', async () => {
    render(<AssistantWidget lang="es" />);
    openWidget();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '¿Cómo van mis publicaciones este mes?' }));
    });
    expect(bodyOf(calls('/api/assistant/chat')[0]).message).toBe('¿Cómo van mis publicaciones este mes?');
  });

  it('mientras llega la respuesta se puede detener y no se puede enviar otro mensaje', async () => {
    const sse = controlledSse();
    chatHandler = () => sse.response;
    render(<AssistantWidget lang="es" />);
    openWidget();

    await sendMessage('Hola');
    await sse.push({ type: 'text_delta', text: 'Escribiendo' });

    expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();

    await sendMessage('Otro');
    expect(calls('/api/assistant/chat')).toHaveLength(1);

    await sse.push({ type: 'done', reason: 'end_turn' });
    await sse.close();
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('con la suscripción inactiva el compositor queda deshabilitado', () => {
    authState.subscription = { canCreate: false };
    render(<AssistantWidget lang="es" />);
    openWidget();
    expect(screen.getByRole('textbox', { name: 'Pídele algo al asistente…' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Ir a configuración' })).toHaveAttribute('href', '/es/dashboard/settings');
  });

  it('un error de red se muestra como aviso, sin romper el panel', async () => {
    chatHandler = () => { throw new TypeError('Failed to fetch'); };
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Hola');
    expect(await screen.findByText('No pudimos conectar con el asistente. Revisa tu conexión.')).toBeInTheDocument();
  });

  it('un rechazo del modelo se muestra con su copy', async () => {
    chatHandler = () => sseResponse([
      { type: 'error', code: 'refusal', message: 'refused' },
      { type: 'done', reason: 'refusal' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Algo raro');
    expect(await screen.findByText('No puedo ayudar con esa solicitud.')).toBeInTheDocument();
  });
});

// ─── Chips de herramientas ────────────────────────────────────────────────────

describe('AssistantWidget — chips de herramientas', () => {
  it('muestra el chip girando y luego terminado con un botón para abrir lo creado', async () => {
    const sse = controlledSse();
    chatHandler = () => sse.response;
    render(<AssistantWidget lang="es" />);
    openWidget();

    await sendMessage('Crea un carrusel');
    await sse.push({ type: 'tool_start', toolUseId: 'tu-1', name: 'create_carousel' });

    expect(screen.getByRole('status')).toHaveTextContent('Creando carrusel…');
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();

    await sse.push({
      type: 'tool_end', toolUseId: 'tu-1', name: 'create_carousel', ok: true,
      links: [{ label: 'Carrusel', href: '/es/dashboard/content/create?item=item-9' }],
    });
    await sse.push({ type: 'text_delta', text: 'Listo, ya está el carrusel.' });
    await sse.push({ type: 'done', reason: 'end_turn' });
    await sse.close();

    const chip = screen.getByRole('status');
    expect(chip).toHaveTextContent('Creando carrusel');
    expect(chip).not.toHaveTextContent('…');
    expect(await screen.findByText('Listo, ya está el carrusel.')).toBeInTheDocument();

    fireEvent.click(within(chip).getByRole('button', { name: 'Abrir' }));
    expect(router.push).toHaveBeenCalledWith('/es/dashboard/content/create?item=item-9');
    // Una herramienta terminó: pudo gastar créditos, se refresca la sesión.
    expect(authRefresh).toHaveBeenCalled();
  });

  it('no ofrece «Abrir» para enlaces fuera del dashboard', async () => {
    chatHandler = () => sseResponse([
      { type: 'tool_start', toolUseId: 'tu-1', name: 'get_content' },
      {
        type: 'tool_end', toolUseId: 'tu-1', name: 'get_content', ok: true,
        links: [
          { label: 'fuera', href: 'https://evil.example/x' },
          { label: 'otro idioma', href: '/en/dashboard/content' },
          { label: 'protocolo relativo', href: '//evil.example' },
        ],
      },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Lee el contenido');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Leyendo el contenido'));
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
  });

  it('una herramienta fallida muestra el fallo y su mensaje', async () => {
    chatHandler = () => sseResponse([
      { type: 'tool_start', toolUseId: 'tu-1', name: 'generate_content_image' },
      {
        type: 'tool_end', toolUseId: 'tu-1', name: 'generate_content_image', ok: false,
        error: { code: 'provider_error', status: 502, message: 'El proveedor de imágenes no respondió' },
      },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Genera una imagen');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Generando imagen · Falló'));
    expect(screen.getByText('El proveedor de imágenes no respondió')).toBeInTheDocument();
  });

  it('un chip que quedó girando al cortarse el stream pasa a fallido', async () => {
    chatHandler = () => sseResponse([
      { type: 'tool_start', toolUseId: 'tu-1', name: 'sync_social_data' },
      // El stream se corta sin tool_end ni done.
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Sincroniza');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sincronizando redes · Falló'));
  });

  it('data_changed avisa a las páginas abiertas', async () => {
    const seen: unknown[] = [];
    const onChange = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    chatHandler = () => sseResponse([
      { type: 'data_changed', entities: ['content', 'scheduled'] },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Programa el post');
    await waitFor(() => expect(seen).toEqual([{ entities: ['content', 'scheduled'] }]));
    window.removeEventListener(DATA_CHANGED_EVENT, onChange);
  });

  it('ui_action solo navega dentro del dashboard del idioma actual', async () => {
    chatHandler = () => sseResponse([
      { type: 'ui_action', action: { type: 'navigate', href: 'https://evil.example/phish' } },
      { type: 'ui_action', action: { type: 'navigate', href: '//evil.example' } },
      { type: 'ui_action', action: { type: 'navigate', href: '/en/dashboard/content' } },
      { type: 'ui_action', action: { type: 'navigate', href: '/es/dashboard-evil' } },
      { type: 'ui_action', action: { type: 'navigate', href: '/es/dashboard/content/calendar' } },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Abre el calendario');
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledWith('/es/dashboard/content/calendar');
  });
});

// ─── Tarjeta de confirmación ──────────────────────────────────────────────────

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();

function confirmationEvents(): SseEvent[] {
  return [
    { type: 'message_start', conversationId: 'conv-1', turnId: 't1' },
    { type: 'text_delta', text: 'Voy a publicarlo.' },
    { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
    {
      type: 'confirmation_required',
      actionId: 'act-1',
      toolUseId: 'tu-pub',
      name: 'publish_content',
      summary: 'Publicar «Lanzamiento» en @cafeandes ahora',
      preview: {
        title: 'Lanzamiento',
        accounts: ['@cafeandes'],
        text: '<untrusted_content source="content">Nuevo café <b>de origen</b></untrusted_content>',
      },
      credits: 0,
      expiresAt: inAnHour(),
    },
    { type: 'done', reason: 'awaiting_confirmation' },
  ];
}

describe('AssistantWidget — confirmaciones', () => {
  it('convierte el chip en una tarjeta con resumen, vista previa y botones', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica el lanzamiento');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    expect(within(card).getByText('Publicar «Lanzamiento» en @cafeandes ahora')).toBeInTheDocument();
    expect(within(card).getByText('Lanzamiento')).toBeInTheDocument();
    expect(within(card).getByText('@cafeandes')).toBeInTheDocument();
    // Las etiquetas <untrusted_content> se quitan y el HTML sale como texto.
    expect(within(card).getByText('Nuevo café <b>de origen</b>')).toBeInTheDocument();
    expect(card.textContent).not.toContain('untrusted_content');
    expect(card.querySelector('b')).toBeNull();

    expect(within(card).getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    // El chip «Publicando…» se reemplazó por la tarjeta.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('muestra el coste en créditos cuando la acción gasta', async () => {
    const events = confirmationEvents();
    const req = events[3] as Extract<SseEvent, { type: 'confirmation_required' }>;
    req.credits = 12;
    chatHandler = () => sseResponse(events);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');
    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    expect(card.textContent).toMatch(/12/);
  });

  it('Confirmar llama a la acción y sigue el turno reanudado', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    const resume = controlledSse();
    actionHandler = () => resume.response;
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica el lanzamiento');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' })); });

    const [call] = calls('/api/assistant/actions/');
    expect(call[0]).toBe('/api/assistant/actions/act-1?lang=es');
    expect(bodyOf(call)).toEqual({ decision: 'confirm' });

    await resume.push({ type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' });
    expect(within(card).getByText('Ejecutando…')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull();

    await resume.push({
      type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: true,
      links: [{ label: 'Calendario', href: '/es/dashboard/content/calendar' }],
    });
    await resume.push({ type: 'text_delta', text: 'Publicado.' });
    await resume.push({ type: 'done', reason: 'end_turn' });
    await resume.close();

    const done = screen.getByRole('group', { name: 'Necesito tu confirmación' });
    expect(within(done).getByText('Confirmado')).toBeInTheDocument();
    fireEvent.click(within(done).getByRole('button', { name: 'Abrir' }));
    expect(router.push).toHaveBeenCalledWith('/es/dashboard/content/calendar');
    expect(await screen.findByText('Publicado.')).toBeInTheDocument();
  });

  it('Cancelar manda reject y la tarjeta queda cancelada', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    actionHandler = () => sseResponse([
      {
        type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: false,
        error: { code: 'rejected', status: 409, message: 'El usuario canceló la acción' },
      },
      { type: 'text_delta', text: 'Entendido, no lo publico.' },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Cancelar' })); });

    expect(bodyOf(calls('/api/assistant/actions/')[0])).toEqual({ decision: 'reject' });
    await waitFor(() => expect(within(card).getByText('Cancelado')).toBeInTheDocument());
    expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('una acción que ya no está pendiente (409) queda como vencida', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    actionHandler = () => jsonResponse(409, { error: 'Action is not pending', code: 'not_pending' });
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' })); });

    await waitFor(() => expect(
      within(card).getByText('Esta confirmación venció. Pídeselo de nuevo al asistente.'),
    ).toBeInTheDocument());
    expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('una tarjeta vencida por tiempo ya no deja confirmar', async () => {
    const events = confirmationEvents();
    (events[3] as Extract<SseEvent, { type: 'confirmation_required' }>).expiresAt = new Date(Date.now() - 1000).toISOString();
    chatHandler = () => sseResponse(events);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');

    await waitFor(() => expect(
      screen.getByText('Esta confirmación venció. Pídeselo de nuevo al asistente.'),
    ).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(calls('/api/assistant/actions/')).toHaveLength(0);
  });

  it('escribir un mensaje nuevo cancela la tarjeta pendiente', async () => {
    let n = 0;
    chatHandler = () => (n++ === 0
      ? sseResponse(confirmationEvents())
      : sseResponse([
        { type: 'message_start', conversationId: 'conv-1', turnId: 't2' },
        { type: 'text_delta', text: 'Vale, otra cosa.' },
        { type: 'done', reason: 'end_turn' },
      ]));
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');
    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });

    await sendMessage('Mejor no, otra cosa');
    await screen.findByText('Vale, otra cosa.');
    expect(within(card).getByText('Cancelado')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(calls('/api/assistant/actions/')).toHaveLength(0);
  });

  it('si la guardia rechaza el mensaje nuevo (429), la tarjeta sigue pendiente y se puede confirmar', async () => {
    let n = 0;
    chatHandler = () => (n++ === 0
      ? sseResponse(confirmationEvents())
      : jsonResponse(429, { error: 'Assistant quota', assistantQuotaExhausted: true, limit: 300 }));
    actionHandler = () => sseResponse([
      { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
      { type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: true },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica');
    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });

    await sendMessage('Y otra cosa');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usaste tus 300 mensajes del asistente');
    // El servidor nunca procesó el mensaje: la acción sigue pendiente allí.
    expect(within(card).queryByText('Cancelado')).toBeNull();
    const confirmBtn = within(card).getByRole('button', { name: 'Confirmar' });
    expect(confirmBtn).toBeEnabled();

    await act(async () => { fireEvent.click(confirmBtn); });
    expect(calls('/api/assistant/actions/')).toHaveLength(1);
    await waitFor(() => expect(within(card).getByText('Confirmado')).toBeInTheDocument());
  });

  it('si el stream de la confirmación se corta antes del resultado, la tarjeta no queda girando', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    const resume = controlledSse();
    actionHandler = () => resume.response;
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica el lanzamiento');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' })); });
    await resume.push({ type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' });
    expect(within(card).getByText('Ejecutando…')).toBeInTheDocument();

    await resume.fail(new TypeError('network error'));

    expect(within(card).queryByText('Ejecutando…')).toBeNull();
    expect(within(card).getByText('No sabemos si se completó. Vuelve a abrir la conversación para ver el resultado.')).toBeInTheDocument();
  });

  it('Detener durante una confirmación tampoco deja la tarjeta en «Ejecutando…»', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    const resume = controlledSse();
    actionHandler = () => resume.response;
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica el lanzamiento');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' })); });
    await resume.push({ type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' });

    fireEvent.click(screen.getByRole('button', { name: 'Detener' }));
    // En el navegador, abortar el fetch rechaza la lectura con AbortError.
    await resume.fail(new DOMException('aborted', 'AbortError'));

    expect(within(card).queryByText('Ejecutando…')).toBeNull();
    expect(within(card).getByText('No sabemos si se completó. Vuelve a abrir la conversación para ver el resultado.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  });

  it('Reintentar tras un 5xx al confirmar repite la confirmación, no el mensaje anterior', async () => {
    chatHandler = () => sseResponse(confirmationEvents());
    let n = 0;
    actionHandler = () => (n++ === 0
      ? jsonResponse(500, {})
      : sseResponse([
        { type: 'tool_start', toolUseId: 'tu-pub', name: 'publish_content' },
        { type: 'tool_end', toolUseId: 'tu-pub', name: 'publish_content', ok: true },
        { type: 'done', reason: 'end_turn' },
      ]));
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Publica el lanzamiento');

    const card = await screen.findByRole('group', { name: 'Necesito tu confirmación' });
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' })); });
    const alert = await screen.findByRole('alert');
    await act(async () => { fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' })); });

    await waitFor(() => expect(within(card).getByText('Confirmado')).toBeInTheDocument());
    expect(calls('/api/assistant/actions/')).toHaveLength(2);
    expect(bodyOf(calls('/api/assistant/actions/')[1])).toEqual({ decision: 'confirm' });
    // No se reenvió el mensaje del usuario como turno nuevo.
    expect(calls('/api/assistant/chat')).toHaveLength(1);
    expect(screen.getAllByText('Publica el lanzamiento')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ─── Historial ────────────────────────────────────────────────────────────────

function display(id: string, role: 'user' | 'assistant', text: string, tools: unknown[] = []) {
  return { id, role, text, createdAt: '2026-09-20T10:00:00Z', tools };
}

describe('AssistantWidget — cargar conversaciones', () => {
  it('mientras se carga la conversación guardada no se envía nada; después sigue esa conversación', async () => {
    sessionStorage.setItem('kefy-assistant-open', '1');
    sessionStorage.setItem('kefy-assistant-conversation', 'conv-old');
    const load = deferred<Response>();
    conversationHandler = () => load.promise;
    chatHandler = () => sseResponse([
      { type: 'message_start', conversationId: 'conv-old', turnId: 't2' },
      { type: 'text_delta', text: 'Seguimos.' },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    await screen.findByText('Cargando conversación…');

    await sendMessage('Hola');
    expect(calls('/api/assistant/chat')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    // Lo escrito no se pierde.
    expect(screen.getByRole('textbox', { name: 'Pídele algo al asistente…' })).toHaveValue('Hola');

    await act(async () => {
      load.resolve(jsonResponse(200, {
        messages: [display('m1', 'user', 'Pregunta vieja'), display('m2', 'assistant', 'Respuesta vieja')],
        pendingActions: [],
      }));
    });
    await screen.findByText('Respuesta vieja');

    await sendMessage('Hola');
    await waitFor(() => expect(calls('/api/assistant/chat')).toHaveLength(1));
    expect(bodyOf(calls('/api/assistant/chat')[0]).conversationId).toBe('conv-old');
    expect(await screen.findByText('Seguimos.')).toBeInTheDocument();
    expect(screen.getByText('Respuesta vieja')).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('abrir A y luego B del historial: gana B aunque A responda después', async () => {
    listHandler = () => jsonResponse(200, {
      conversations: [
        { id: 'conv-a', title: 'Charla A', last_message_at: new Date().toISOString(), brand_id: null },
        { id: 'conv-b', title: 'Charla B', last_message_at: new Date().toISOString(), brand_id: null },
      ],
      usage: null,
    });
    const slowA = deferred<Response>();
    conversationHandler = (url) => (url.endsWith('/conv-a')
      ? slowA.promise
      : jsonResponse(200, { messages: [display('b1', 'assistant', 'Respuesta B')], pendingActions: [] }));
    render(<AssistantWidget lang="es" />);
    openWidget();

    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
    fireEvent.click(await screen.findByText('Charla A'));
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
    fireEvent.click(await screen.findByText('Charla B'));
    expect(await screen.findByText('Respuesta B')).toBeInTheDocument();

    await act(async () => {
      slowA.resolve(jsonResponse(200, { messages: [display('a1', 'assistant', 'Respuesta A')], pendingActions: [] }));
    });
    expect(screen.queryByText('Respuesta A')).toBeNull();
    expect(screen.getByText('Respuesta B')).toBeInTheDocument();
    expect(sessionStorage.getItem('kefy-assistant-conversation')).toBe('conv-b');
  });

  it('una acción sin resultado en el historial no gira para siempre', async () => {
    sessionStorage.setItem('kefy-assistant-open', '1');
    sessionStorage.setItem('kefy-assistant-conversation', 'conv-old');
    conversationHandler = () => jsonResponse(200, {
      messages: [
        display('m1', 'user', 'Crea un carrusel'),
        // La acción seguía «running» al cargar: el servidor la manda como pending.
        display('m2', 'assistant', '', [{ toolUseId: 'tu-1', name: 'create_carousel', status: 'pending' }]),
      ],
      pendingActions: [],
    });
    render(<AssistantWidget lang="es" />);

    const chip = await screen.findByRole('status');
    expect(chip).toHaveTextContent('Creando carrusel · Sin resultado todavía');
    expect(chip.innerHTML).not.toContain('kefy-assistant-spin');
    expect(screen.getByText('Puede que siga en curso. Vuelve a abrir la conversación más tarde para ver cómo terminó.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Necesito tu confirmación' })).toBeNull();
  });
});

// ─── Bloqueos de gasto ────────────────────────────────────────────────────────

describe('AssistantWidget — tarjetas de bloqueo', () => {
  async function sendAndGetAlert(status: number, body: Record<string, unknown>) {
    chatHandler = () => jsonResponse(status, body);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Hola');
    return screen.findByRole('alert');
  }

  it('429 por cuota de mensajes del asistente: su copy y enlace a planes', async () => {
    const alert = await sendAndGetAlert(429, { error: 'Assistant quota', assistantQuotaExhausted: true, limit: 300 });
    expect(alert).toHaveTextContent('Usaste tus 300 mensajes del asistente de este mes.');
    expect(within(alert).getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/es/dashboard/settings');
    expect(within(alert).queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('429 por créditos de IA: copy de créditos, no de mensajes', async () => {
    const alert = await sendAndGetAlert(429, { error: 'Credits', creditsExhausted: true, limit: 150 });
    expect(alert).toHaveTextContent('Usaste los 150 créditos de IA de este mes.');
    expect(alert).not.toHaveTextContent('mensajes del asistente');
    expect(within(alert).getByRole('link', { name: 'Ver planes' })).toBeInTheDocument();
  });

  it('402 sin suscripción activa', async () => {
    const alert = await sendAndGetAlert(402, { error: 'Subscription required', subscriptionRequired: true });
    expect(alert).toHaveTextContent('Tu suscripción no está activa.');
    expect(within(alert).getByRole('link', { name: 'Ver planes' })).toBeInTheDocument();
  });

  it('503 permite reintentar y el reintento reemplaza el intento fallido', async () => {
    let n = 0;
    chatHandler = () => (n++ === 0
      ? jsonResponse(503, { error: 'Service unavailable' })
      : sseResponse([{ type: 'text_delta', text: 'Ahora sí.' }, { type: 'done', reason: 'end_turn' }]));
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Hola de nuevo');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El asistente no está disponible en este momento.');
    await act(async () => { fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' })); });

    expect(await screen.findByText('Ahora sí.')).toBeInTheDocument();
    expect(calls('/api/assistant/chat')).toHaveLength(2);
    expect(bodyOf(calls('/api/assistant/chat')[1]).message).toBe('Hola de nuevo');
    expect(screen.getAllByText('Hola de nuevo')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un error con banderas de gasto dentro del stream también pinta la tarjeta', async () => {
    chatHandler = () => sseResponse([
      { type: 'tool_start', toolUseId: 'tu-1', name: 'create_post' },
      {
        type: 'error', code: 'credits_exhausted', status: 429, message: 'Credits',
        body: { creditsExhausted: true, limit: 150 },
      },
      { type: 'done', reason: 'end_turn' },
    ]);
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Crea un post');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usaste los 150 créditos de IA de este mes.');
  });

  it('una sesión caducada que no se puede renovar cierra la sesión', async () => {
    chatHandler = () => jsonResponse(401, { error: 'Unauthorized' });
    const base = fetchMock.getMockImplementation() as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/refresh') return jsonResponse(401, { error: 'expired' });
      return base(input, init);
    });
    render(<AssistantWidget lang="es" />);
    openWidget();
    await sendMessage('Hola');
    await waitFor(() => expect(authLogout).toHaveBeenCalledTimes(1));
  });
});

describe('SpendErrorCard', () => {
  it('prioriza las banderas: suscripción > cuota del asistente > créditos > rate limit', () => {
    const { rerender } = render(
      <SpendErrorCard lang="es" status={429} body={{ subscriptionRequired: true, assistantQuotaExhausted: true, creditsExhausted: true, retryAfter: 5, limit: 300 }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Tu suscripción no está activa.');

    rerender(<SpendErrorCard lang="es" status={429} body={{ assistantQuotaExhausted: true, creditsExhausted: true, retryAfter: 5, limit: 300 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Usaste tus 300 mensajes del asistente');

    rerender(<SpendErrorCard lang="es" status={429} body={{ creditsExhausted: true, retryAfter: 5, limit: 150 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Usaste los 150 créditos de IA');
  });

  it('rate limit: cuenta atrás y el reintento se habilita al llegar a 0', () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<SpendErrorCard lang="es" status={429} body={{ error: 'Too many requests', retryAfter: 2 }} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Podrás reintentar en 2 s.');
    const button = screen.getByRole('button', { name: 'Reintentar' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Ver planes' })).toBeNull();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('alert')).toHaveTextContent('Podrás reintentar en 1 s.');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('alert')).toHaveTextContent('Ya puedes reintentar.');
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('en inglés usa la copy en inglés', () => {
    render(<SpendErrorCard lang="en" status={429} body={{ assistantQuotaExhausted: true, limit: 300 }} />);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('Usaste');
    expect(within(alert).getByRole('link')).toHaveAttribute('href', '/en/dashboard/settings');
  });

  it('un mensaje de error desconocido y largo no se muestra tal cual', () => {
    render(<SpendErrorCard lang="es" status={400} body={{ error: 'x'.repeat(400) }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal. Inténtalo de nuevo.');
  });
});
