import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContentItem } from '@/types/content';

// Regresión (producción): se publicó un reel como imagen. El modal dejaba
// pasar reels sin video renderizado (por ejemplo, con solo un mux_playback_id
// legacy), y el backend terminaba publicando la portada como foto.

vi.mock('@/components/dashboard/MuxReelPlayer', () => ({
  MuxReelPlayer: () => <div data-testid="reel-player" />,
}));

import ScheduleModal from '@/components/dashboard/content/ScheduleModal';

const ACCOUNT = {
  id: 'sa-ig', platform: 'instagram', username: 'marca', status: 'active',
};

function reelItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id:           'item-1',
    channel:      'instagram' as ContentItem['channel'],
    content_type: 'reel',
    status:       'approved',
    title:        'Mi reel',
    body:         'Texto del reel',
    image_url:    'https://cdn.example.com/cover.jpg',
    image_status: null,
    hashtags:     ['kefy'],
    slides:       [{ image_url: 'https://cdn.example.com/cover.jpg' }] as ContentItem['slides'],
    video_url:    null,
    created_at:   new Date().toISOString(),
    ...overrides,
  } as ContentItem;
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(item: ContentItem) {
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts: [ACCOUNT] });
    if (url.includes('/renditions')) {
      return jsonResponse({
        renditions: [{
          id: item.id, content_item_id: item.id, format: item.content_type, status: 'ready',
          body: item.body, hashtags: item.hashtags, image_url: item.image_url, slides: item.slides,
          video_url: item.video_url ?? null, mux_playback_id: item.mux_playback_id ?? null,
          render_status: item.render_status ?? null, error_message: null, is_primary: true,
        }],
      });
    }
    if (url === '/api/social/publish') return jsonResponse({ results: [] });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderModal(item: ContentItem) {
  stubFetch(item);
  return render(
    <ScheduleModal open onClose={() => {}} initialItem={item} lang="es" />,
  );
}

async function clickPublish() {
  // "Publicar ahora" aparece dos veces: el toggle de modo y el botón de confirmar
  // (el último del formulario).
  const buttons = await screen.findAllByRole('button', { name: /publicar ahora/i });
  const btn = buttons[buttons.length - 1];
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
}

async function selectAccount() {
  const accountBtn = await screen.findByRole('button', { name: /@marca/i });
  fireEvent.click(accountBtn);
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ScheduleModal — publicar un reel', () => {
  it('reel sin video: bloquea la publicación y avisa que el video se está generando', async () => {
    renderModal(reelItem());
    await selectAccount();
    await clickPublish();

    expect(await screen.findByText(/video se está generando/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/social/publish')).toBe(false);
  });

  it('reel con solo mux_playback_id legacy: tampoco publica (no es un video publicable)', async () => {
    renderModal(reelItem({ mux_playback_id: 'mux-123', render_status: 'ready' }));
    await selectAccount();
    await clickPublish();

    expect(await screen.findByText(/video se está generando/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/social/publish')).toBe(false);
  });

  it('reel con video renderizado: publica con format=reel', async () => {
    renderModal(reelItem({ video_url: 'https://s3.example.com/reel.mp4', render_status: 'ready' }));
    await selectAccount();
    await clickPublish();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/api/social/publish');
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
        content_item_id:    'item-1',
        social_account_ids: ['sa-ig'],
        format:             'reel',
      });
    });
  });
});

// ─── initialPlatform: preselección de cuenta al publicar en una red puntual ──
// La vista de detalle (/dashboard/content/[itemId]) ofrece "publicar también
// en X" para una red a la que el item aún no salió; debe abrir el modal con
// la cuenta de esa red ya marcada, sin tocar las demás.

describe('ScheduleModal — initialPlatform', () => {
  it('pre-marca la cuenta de la plataforma indicada sin tocar las otras', async () => {
    const accounts = [
      { id: 'sa-ig', platform: 'instagram', username: 'marca_ig', status: 'active' },
      { id: 'sa-li', platform: 'linkedin',  username: 'marca_li', status: 'active' },
    ];
    const item = postItem();
    const mock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts });
      if (url.includes('/renditions')) {
        return jsonResponse({
          renditions: [{
            id: item.id, content_item_id: item.id, format: 'post', status: 'ready',
            body: item.body, hashtags: item.hashtags, image_url: item.image_url, slides: null,
            video_url: null, mux_playback_id: null, render_status: null, error_message: null, is_primary: true,
          }],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', mock);

    render(<ScheduleModal open onClose={() => {}} initialItem={item} initialPlatform="linkedin" lang="es" />);

    const liBtn = await screen.findByRole('button', { name: /@marca_li/i });
    const igBtn = await screen.findByRole('button', { name: /@marca_ig/i });
    // Las cuentas son botones de alternar: el estado marcado es aria-pressed
    // (antes, un «✓» de texto que los lectores de pantalla no anunciaban).
    await waitFor(() => expect(liBtn).toHaveAttribute('aria-pressed', 'true'));
    expect(igBtn).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─── Generar otro formato desde el modal ────────────────────────────────────
// Regresión (producción): al pulsar «Generar versión de carrusel» lo único que
// pasaba era que el botón decía «Generando…». La petición tarda minutos: no
// había esqueleto, ni barra, ni aviso al terminar con la PWA en segundo plano.

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  constructor(public title: string, public options?: NotificationOptions) {}
}

function postItem(): ContentItem {
  return {
    id:           'item-post',
    channel:      'generic' as ContentItem['channel'],
    content_type: 'post',
    status:       'approved',
    title:        null,
    body:         '¿Publicar todos los días es la clave del éxito? Mentira.',
    image_url:    'https://cdn.example.com/post.jpg',
    image_status: null,
    hashtags:     ['marketing'],
    slides:       null,
    video_url:    null,
    created_at:   new Date().toISOString(),
  } as ContentItem;
}

/** Deja la petición de la rendición colgada para poder observar el estado de carga. */
function stubFetchWithPendingRendition(item: ContentItem) {
  let resolvePost: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => { resolvePost = resolve; });

  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts: [ACCOUNT] });
    if (url.includes('/renditions') && init?.method === 'POST') return pending;
    if (url.includes('/renditions')) {
      return jsonResponse({
        renditions: [{
          id: item.id, content_item_id: item.id, format: 'post', status: 'ready',
          body: item.body, hashtags: item.hashtags, image_url: item.image_url, slides: null,
          video_url: null, mux_playback_id: null, render_status: null, error_message: null, is_primary: true,
        }],
      });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', mock);
  return { mock, resolvePost };
}

async function startCarouselGeneration(item: ContentItem) {
  const { resolvePost } = stubFetchWithPendingRendition(item);
  render(<ScheduleModal open onClose={() => {}} initialItem={item} lang="es" />);

  fireEvent.click(await screen.findByRole('button', { name: /Carrusel/i }));
  fireEvent.click(await screen.findByRole('button', { name: /Generar versión de Carrusel/i }));
  return resolvePost;
}

describe('ScheduleModal — generar otro formato', () => {
  beforeEach(() => {
    FakeNotification.permission = 'granted';
    FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission);
    vi.stubGlobal('Notification', FakeNotification as unknown as typeof Notification);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  });

  it('mientras genera muestra el esqueleto y el paso en curso, no sólo «Generando…»', async () => {
    await startCarouselGeneration(postItem());

    const status = await screen.findByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText('Escribiendo los slides…')).toBeTruthy();
  });

  it('pide permiso de notificaciones dentro del click, que es lo que exige iOS', async () => {
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission = vi.fn(async () => 'granted' as NotificationPermission);

    await startCarouselGeneration(postItem());
    await waitFor(() => expect(FakeNotification.requestPermission).toHaveBeenCalled());
  });

  it('al terminar avisa por notificación local si la app está en segundo plano', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });

    const resolvePost = await startCarouselGeneration(postItem());
    resolvePost(jsonResponse({
      rendition: {
        id: 'r1', content_item_id: 'item-post', format: 'carousel', status: 'ready',
        body: 'desc', hashtags: [], image_url: 'https://cdn.example.com/s1.jpg',
        slides: [{ slide_order: 1, title: 'T1', body: 'B1', image_url: 'https://cdn.example.com/s1.jpg', text_baked: false }],
        video_url: null, render_status: null, error_message: null,
      },
    }, true, 201));

    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    expect(showNotification.mock.calls[0][0]).toMatch(/carrusel/i);
  });

  it('si falla, la notificación lo dice en vez de dejar al usuario esperando', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });

    const resolvePost = await startCarouselGeneration(postItem());
    resolvePost(jsonResponse({ error: 'La generación falló' }, false, 502));

    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    expect(showNotification.mock.calls[0][0]).toMatch(/no se pudo generar/i);
    expect(await screen.findByText(/La generación falló/)).toBeTruthy();
  });

  it('con la app en primer plano no interrumpe con una notificación', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });

    const resolvePost = await startCarouselGeneration(postItem());
    resolvePost(jsonResponse({
      rendition: {
        id: 'r1', content_item_id: 'item-post', format: 'carousel', status: 'ready',
        body: 'desc', hashtags: [], image_url: null, slides: [], video_url: null,
        render_status: null, error_message: null,
      },
    }, true, 201));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(showNotification).not.toHaveBeenCalled();
  });
});

// ─── «Publicar» explica por qué no se puede pulsar ──────────────────────────
// Auditoría UX 5.3: `canSubmit` deshabilitaba el botón sin decir por qué, y
// «Conectar cuentas →» llevaba a /dashboard/social, una ruta que no existe.

function stubAccounts(accounts: unknown[], extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts });
    if (url.includes('/renditions')) return jsonResponse({ renditions: [] });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function submitButton(name: RegExp = /publicar ahora/i) {
  const buttons = screen.getAllByRole('button', { name });
  return buttons[buttons.length - 1];
}

describe('ScheduleModal — motivo del botón deshabilitado', () => {
  it('sin cuentas conectadas: lo explica junto al botón y enlaza a Ajustes › Redes', async () => {
    stubAccounts([]);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} lang="es" />);

    const reason = await screen.findByText('Conecta al menos una cuenta para poder publicar.');
    const btn = submitButton();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // El motivo es la descripción accesible del botón.
    expect(btn.getAttribute('aria-describedby')).toBe(reason.closest('p')!.id);

    const link = screen.getByRole('link', { name: /conectar cuentas/i });
    expect(link).toHaveAttribute('href', '/es/dashboard/settings#social');
  });

  it('con cuentas pero ninguna elegida: pide elegir dónde publicar, y el aviso se va al elegir', async () => {
    stubAccounts([ACCOUNT]);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} lang="es" />);

    expect(await screen.findByText('Elige dónde publicar antes de continuar.')).toBeTruthy();
    await selectAccount();
    await waitFor(() => expect(screen.queryByText('Elige dónde publicar antes de continuar.')).toBeNull());
    expect(submitButton()).not.toHaveAttribute('aria-disabled');
  });

  it('fecha en el pasado: lo explica y no programa', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const mock = stubAccounts([ACCOUNT]);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} initialDate={yesterday} lang="es" />);
    await selectAccount();

    expect(await screen.findByText(/ya pasaron: elige un momento futuro/i)).toBeTruthy();
    fireEvent.click(submitButton(/confirmar programación/i));
    await new Promise((r) => setTimeout(r, 50));
    expect(mock.mock.calls.some(([url]) => url === '/api/social/schedule')).toBe(false);
  });

  it('la hora se elige con un campo de hora nativo con etiqueta', async () => {
    stubAccounts([ACCOUNT]);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} initialDate={tomorrow} lang="es" />);
    const time = await screen.findByLabelText('Hora');
    expect(time).toHaveAttribute('type', 'time');
  });
});

// ─── Resultado: no se cierra solo ───────────────────────────────────────────

describe('ScheduleModal — resultado', () => {
  it('tras publicar muestra el resultado y no se cierra solo', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    stubAccounts([ACCOUNT], (url) => (url === '/api/social/publish'
      ? jsonResponse({ results: [{ social_account_id: 'sa-ig', platform: 'instagram', status: 'published' }] })
      : undefined));
    render(<ScheduleModal open onClose={onClose} onSuccess={onSuccess} initialItem={postItem()} lang="es" />);
    await selectAccount();
    await clickPublish();

    expect(await screen.findByText('Publicado')).toBeTruthy();
    expect(screen.getByText('Se publicó en 1 cuenta.')).toBeTruthy();
    expect(onSuccess).toHaveBeenCalledWith('now');

    // Antes: setTimeout(onClose, 1200). Ahora el usuario decide.
    await new Promise((r) => setTimeout(r, 1400));
    expect(onClose).not.toHaveBeenCalled();

    // El del pie (el otro «Cerrar» es la X de la cabecera).
    const closeButtons = screen.getAllByRole('button', { name: 'Cerrar' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('si alguna cuenta falla, el resultado lo dice', async () => {
    const accounts = [
      { id: 'sa-ig', platform: 'instagram', username: 'marca_ig', status: 'active' },
      { id: 'sa-li', platform: 'linkedin',  username: 'marca_li', status: 'active' },
    ];
    stubAccounts(accounts, (url) => (url === '/api/social/publish'
      ? jsonResponse({ results: [
        { social_account_id: 'sa-ig', platform: 'instagram', status: 'published' },
        { social_account_id: 'sa-li', platform: 'linkedin', status: 'failed', error: 'Token caducado' },
      ] })
      : undefined));
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} lang="es" />);
    fireEvent.click(await screen.findByRole('button', { name: /@marca_ig/i }));
    fireEvent.click(await screen.findByRole('button', { name: /@marca_li/i }));
    await clickPublish();

    expect(await screen.findByText('No se pudo en: @marca_li.')).toBeTruthy();
  });

  it('tras programar ofrece ver el calendario (salvo desde el propio calendario)', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const scheduleOk = (url: string) => (url === '/api/social/schedule'
      ? jsonResponse({ results: [{ social_account_id: 'sa-ig', platform: 'instagram', status: 'scheduled' }] }, true, 201)
      : undefined);

    stubAccounts([ACCOUNT], scheduleOk);
    const { unmount } = render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} initialDate={tomorrow} lang="es" />);
    await selectAccount();
    fireEvent.click(submitButton(/confirmar programación/i));
    expect(await screen.findByText('Programado')).toBeTruthy();
    expect(screen.getByRole('link', { name: /ver en el calendario/i })).toHaveAttribute('href', '/es/dashboard/content/calendar');
    unmount();

    stubAccounts([ACCOUNT], scheduleOk);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} initialDate={tomorrow} lang="es" showCalendarLink={false} />);
    await selectAccount();
    fireEvent.click(submitButton(/confirmar programación/i));
    expect(await screen.findByText('Programado')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /ver en el calendario/i })).toBeNull();
  });

  it('el error del servidor sale en el idioma del usuario, no «Error publishing»', async () => {
    stubAccounts([ACCOUNT], (url) => (url === '/api/social/publish' ? jsonResponse({}, false, 500) : undefined));
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} lang="es" />);
    await selectAccount();
    await clickPublish();

    expect(await screen.findByText('No se pudo publicar. Inténtalo de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/error publishing/i)).toBeNull();
  });

  it('en inglés, todo el flujo está en inglés', async () => {
    stubAccounts([]);
    render(<ScheduleModal open onClose={() => {}} initialItem={postItem()} lang="en" />);
    expect(await screen.findByText('Connect at least one account to publish.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /connect accounts/i })).toHaveAttribute('href', '/en/dashboard/settings#social');
  });
});
