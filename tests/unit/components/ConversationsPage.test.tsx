import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ThreadPreview, Message, CommentItem } from '@/types/conversations';

// ─── Router de mentira ───────────────────────────────────────────────────────
// Next sincroniza history.pushState/replaceState con useSearchParams; aquí se
// imita con un store que lee window.location y se avisa en cada cambio.

const nav = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  notify() { for (const l of nav.listeners) l(); },
}));

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    useParams: () => ({ lang: 'es' }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (cb: () => void) => { nav.listeners.add(cb); return () => { nav.listeners.delete(cb); }; },
        () => window.location.search,
        () => '',
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ activeBrand: { id: 'brand-1', name: 'Mi marca' } }),
}));

vi.mock('@/hooks/useUnreadCount', () => ({
  refreshUnreadCount: vi.fn(async () => {}),
  useUnreadCount: () => 0,
}));

import ConversationsPage from '@/app/[lang]/dashboard/conversations/page';

// ─── Datos ───────────────────────────────────────────────────────────────────

const BASE = '/es/dashboard/conversations';
const account = { id: 'acc-1', platform: 'instagram', username: 'mimarca' };
const now = new Date().toISOString();

function thread(id: string, name: string, readAt: string | null): ThreadPreview {
  return {
    id, platform: 'instagram', platform_thread_id: id, platform_message_id: `${id}-m`,
    sender_id: `${id}-u`, sender_name: name, sender_avatar: null,
    body: `Hola, soy ${name}`, direction: 'inbound', read_at: readAt, created_at: now,
    kefy_social_accounts: account,
  };
}

const THREADS = [thread('th-1', 'Ana', null), thread('th-2', 'Beto', now)];

function messagesFor(id: string): Message[] {
  const t = THREADS.find((x) => x.platform_thread_id === id)!;
  return [{
    id: `${id}-msg`, sender_id: t.sender_id, sender_name: t.sender_name, sender_avatar: null,
    body: t.body, direction: 'inbound', read_at: null, created_at: now,
  }];
}

let comments: CommentItem[] = [];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function setMobile(mobile: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: mobile && q.includes('max-width'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const root = () => document.querySelector('[data-view]');

// ─── Historial ───────────────────────────────────────────────────────────────

let stack: string[] = [];
let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  comments = [];
  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);
  origReplace(null, '', BASE);
  stack = [BASE];

  pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation((state, unused, url) => {
    origPush(state, unused, url);
    stack.push(String(url));
    nav.notify();
  });
  replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation((state, unused, url) => {
    origReplace(state, unused, url);
    stack[stack.length - 1] = String(url);
    nav.notify();
  });
  // El «atrás» del navegador: vuelve a la entrada anterior y dispara popstate.
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    if (stack.length > 1) stack.pop();
    origReplace(null, '', stack[stack.length - 1]);
    window.dispatchEvent(new PopStateEvent('popstate'));
    nav.notify();
  });

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/messaging?')) return jsonResponse({ threads: THREADS });
    if (url.startsWith('/api/messaging/sync')) return jsonResponse({ synced: 0 });
    if (url.startsWith('/api/messaging/')) {
      const id = decodeURIComponent(url.split('/api/messaging/')[1].split('?')[0]);
      return jsonResponse({ messages: messagesFor(id), account });
    }
    if (url.startsWith('/api/comments/sync')) return jsonResponse({ synced: 0 });
    if (url.startsWith('/api/comments')) return jsonResponse({ comments });
    return jsonResponse({});
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Conversaciones — master-detail en móvil', () => {
  it('abrir un hilo muestra solo el hilo, y «Volver» regresa a la lista con el historial', async () => {
    setMobile(true);
    render(<ConversationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

    expect(root()).toHaveAttribute('data-view', 'thread');
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('thread=th-1');
    expect(window.location.search).toContain('account=acc-1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana' })).toBeInTheDocument();
    // El compositor está en español (antes decía «Reply...») y tiene nombre.
    expect(screen.getByRole('textbox', { name: 'Tu respuesta' })).toHaveAttribute('placeholder', 'Escribe una respuesta…');

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las conversaciones' }));

    expect(backSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(root()).toHaveAttribute('data-view', 'list'));
    expect(window.location.search).not.toContain('thread=');
  });

  it('el botón atrás del navegador cierra el hilo sin salir de la página', async () => {
    setMobile(true);
    render(<ConversationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    expect(root()).toHaveAttribute('data-view', 'thread');

    // Atrás del navegador (no el botón «Volver»): solo cambia la URL.
    window.history.back();

    await waitFor(() => expect(root()).toHaveAttribute('data-view', 'list'));
    expect(window.location.pathname).toBe(BASE);
  });

  it('un enlace profundo abre el hilo, y «Volver» quita ?thread sin ir atrás', async () => {
    setMobile(true);
    window.history.replaceState(null, '', `${BASE}?thread=th-2&account=acc-1`);
    render(<ConversationsPage />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Beto' })).toBeInTheDocument();
    expect(root()).toHaveAttribute('data-view', 'thread');

    replaceSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a las conversaciones' }));

    // No hubo entrada propia en el historial: ir atrás sacaría de la página.
    expect(backSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    await waitFor(() => expect(root()).toHaveAttribute('data-view', 'list'));
    expect(window.location.search).not.toContain('thread=');
  });

  it('en escritorio abrir un hilo solo reemplaza la URL (no apila historial)', async () => {
    setMobile(false);
    render(<ConversationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.search).toContain('thread=th-1');
    // El hilo abierto queda marcado en la lista.
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-current', 'true');
  });
});

describe('Conversaciones — pestañas y comentarios', () => {
  it('DMs / Comentarios son un tablist accesible con flechas, y la pestaña va a la URL', async () => {
    setMobile(false);
    render(<ConversationsPage />);

    const tablist = screen.getByRole('tablist', { name: 'Tipo de conversación' });
    const dms = within(tablist).getByRole('tab', { name: /DMs/ });
    const commentsTab = within(tablist).getByRole('tab', { name: 'Comentarios' });
    expect(dms).toHaveAttribute('aria-selected', 'true');
    // El contador de no leídos tiene texto para lectores de pantalla (y el
    // número visible, aria-hidden, no se lee dos veces).
    await waitFor(() => expect(dms).toHaveAccessibleName(/^DMs\s*,\s*1 sin leer$/));

    fireEvent.click(commentsTab);
    expect(commentsTab).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toContain('tab=comments');

    fireEvent.keyDown(commentsTab, { key: 'ArrowLeft' });
    expect(dms).toHaveAttribute('aria-selected', 'true');
    expect(dms).toHaveFocus();
  });

  it('«Ver conversación» abre el diálogo compartido con la conversación completa', async () => {
    setMobile(false);
    comments = [{
      id: 'c-1', platform: 'instagram', platform_post_id: 'post-1', platform_comment_id: 'pc-1',
      author_id: 'u-9', author_name: 'Carla', author_avatar: null,
      body: '¿Hacen envíos?', replied_at: null, reply_body: null, created_at: now,
      kefy_social_accounts: account,
    }];
    window.history.replaceState(null, '', `${BASE}?tab=comments`);
    render(<ConversationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver conversación' }));

    const dialog = await screen.findByRole('dialog', { name: 'Carla' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('¿Hacen envíos?')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
  });
});
