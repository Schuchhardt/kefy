import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ContentItem } from '@/types/content';

// Flujo de «Mis contenidos» tras la auditoría UX (5.3 «Crear contenido»,
// Sprint 4.6): formulario abierto cuando no hay contenido o con ?new=1, un
// solo lugar de feedback con siguiente paso explícito, errores del locale,
// borrar con el diálogo de la app y tarjetas operables con teclado.

let searchParams = new URLSearchParams();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useParams: () => ({ lang: 'es' }),
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock('@/components/dashboard/content/EditContentModal',    () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/ManualCreateModal',   () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/RecommendModal',      () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/ContentLibraryModal', () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/ScheduleModal', () => ({
  default: ({ open, initialItem }: { open: boolean; initialItem?: { id: string } | null }) =>
    open ? <div data-testid="schedule-modal">{initialItem?.id}</div> : null,
}));

import ContentPage from '@/app/[lang]/dashboard/content/create/page';
import { BrandProvider } from '@/lib/brand-context';

function makeItem(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id:           'item-1',
    channel:      'generic' as ContentItem['channel'],
    content_type: 'post',
    status:       'draft',
    title:        null,
    body:         'Texto de un post existente',
    image_url:    'https://cdn.example.com/existing.jpeg',
    image_status: 'ready',
    hashtags:     [],
    slides:       null,
    video_url:    null,
    created_at:   new Date().toISOString(),
    ...over,
  };
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

/** fetch simulado: cada test añade sus rutas; el resto responde vacío. */
function stubFetch(serverItems: () => ContentItem[], extra: Handler = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = await extra(url, init);
    if (custom) return custom;
    if (url.startsWith('/api/content?'))        return jsonResponse({ items: serverItems() });
    if (url.startsWith('/api/brand-kit'))       return jsonResponse({});
    if (url.startsWith('/api/automations'))     return jsonResponse({ rules: [] });
    if (url.startsWith('/api/content-library')) return jsonResponse({ items: [] });
    if (url.startsWith('/api/brands/active'))   return jsonResponse({ brand: null });
    if (url.startsWith('/api/brands'))          return jsonResponse({ brands: [], count: 0, limit: 1, canCreate: false });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const renderPage = () => render(<BrandProvider><ContentPage /></BrandProvider>);
const topicField = () => screen.queryByRole('textbox', { name: /Tema/ });

describe('Mis contenidos — formulario de generación', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sin contenido, el formulario se abre solo y el estado vacío tiene su propia acción', async () => {
    stubFetch(() => []);
    renderPage();

    await waitFor(() => expect(screen.getByText('Todavía no tienes contenido')).toBeInTheDocument());
    expect(topicField()).toBeInTheDocument();

    // La acción del estado vacío lleva al campo del tema (antes decía «usa el
    // botón Generar con IA», que quedaba fuera de la vista).
    const empty = screen.getByText('Todavía no tienes contenido').closest('.ui-empty') as HTMLElement;
    fireEvent.click(within(empty).getByRole('button', { name: 'Generar mi primera pieza' }));
    await waitFor(() => expect(document.activeElement).toBe(topicField()));
  });

  it('con contenido empieza cerrado; «Generar con IA» lo abre y ocultarlo no borra lo escrito', async () => {
    stubFetch(() => [makeItem()]);
    renderPage();

    await waitFor(() => expect(screen.getByTestId('content-card')).toBeInTheDocument());
    expect(topicField()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generar con IA' }));
    const field = await waitFor(() => topicField() as HTMLTextAreaElement);
    fireEvent.change(field, { target: { value: 'Mi tema a medio escribir' } });

    // Ya no hay «Cancelar» que borra: el botón solo oculta.
    fireEvent.click(screen.getByRole('button', { name: /Ocultar el formulario/ }));
    expect(topicField()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generar con IA' }));
    await waitFor(() => expect(topicField()).toHaveValue('Mi tema a medio escribir'));
  });

  it('?new=1 (botón «Crear contenido» del sidebar) abre el formulario aunque haya contenido', async () => {
    searchParams = new URLSearchParams({ new: '1' });
    stubFetch(() => [makeItem()]);
    renderPage();

    await waitFor(() => expect(topicField()).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(topicField()));
  });
});

describe('Mis contenidos — selector de tipo', () => {
  beforeEach(() => { push.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  // Regresión: con ?type=carousel «Imagen» salía marcado (active = genType !== 'reel').
  it('un carrusel sugerido se muestra como carrusel, no como «Imagen»', async () => {
    searchParams = new URLSearchParams({ topic: 'Tema', type: 'carousel' });
    stubFetch(() => []);
    renderPage();

    const carousel = await screen.findByRole('button', { name: 'Carrusel' });
    expect(carousel).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Imagen' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Generar Carrusel' })).toBeInTheDocument();

    // Cambiar a Imagen no hace desaparecer la opción sugerida.
    fireEvent.click(screen.getByRole('button', { name: 'Imagen' }));
    expect(screen.getByRole('button', { name: 'Imagen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Carrusel' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Generar Post' })).toBeInTheDocument();
  });

  it('una story sugerida se representa como story vertical', async () => {
    searchParams = new URLSearchParams({ topic: 'Tema', type: 'story' });
    stubFetch(() => []);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Story vertical' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Imagen' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sin tipo sugerido solo ofrece Imagen y Video', async () => {
    searchParams = new URLSearchParams({ topic: 'Tema' });
    stubFetch(() => []);
    renderPage();

    const group = await screen.findByRole('group', { name: 'Tipo' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Imagen', 'Video']);
  });
});

describe('Mis contenidos — resultado y siguiente paso', () => {
  let items: ContentItem[];

  beforeEach(() => {
    push.mockReset();
    items = [];
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('al terminar muestra una tarjeta con «Revisar y publicar» y «Programar»', async () => {
    searchParams = new URLSearchParams({ topic: 'Detrás de escena', type: 'story' });
    const story = makeItem({ id: 'story-1', content_type: 'story', body: 'Una story generada', image_url: 'https://cdn.example.com/story.jpeg' });
    stubFetch(() => items, (url) => {
      if (url === '/api/content/story') {
        items = [story];
        return jsonResponse({ itemId: 'story-1', body: 'Una story generada', image_url: story.image_url });
      }
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Generar Story' }));

    const heading = await screen.findByRole('heading', { name: 'Tu story está lista' });
    const result = heading.closest('[data-testid="generation-result"]') as HTMLElement;
    expect(within(result).getByRole('link', { name: 'Revisar y publicar' })).toHaveAttribute('href', '/es/dashboard/content/story-1');

    fireEvent.click(within(result).getByRole('button', { name: 'Programar' }));
    expect(await screen.findByTestId('schedule-modal')).toHaveTextContent('story-1');

    // El texto ya no se vuelca como <pre> dentro del formulario.
    expect(document.querySelector('form pre')).toBeNull();
  });

  it('dos variantes de reel: un enlace para revisar cada una', async () => {
    searchParams = new URLSearchParams({ topic: 'Tips', type: 'reel' });
    stubFetch(() => items, (url) => {
      if (url === '/api/content/reel') {
        items = [
          makeItem({ id: 'reel-a', content_type: 'reel', image_url: null, slides: [] }),
          makeItem({ id: 'reel-b', content_type: 'reel', image_url: null, slides: [] }),
        ];
        return jsonResponse({ variants: [{ itemId: 'reel-a', scenes: [] }, { itemId: 'reel-b', scenes: [] }] });
      }
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Generar Reel' }));
    await screen.findByRole('heading', { name: 'Tus 2 variantes de reel están listas' });
    expect(screen.getByRole('link', { name: 'Revisar variante 1' })).toHaveAttribute('href', '/es/dashboard/content/reel-a');
    expect(screen.getByRole('link', { name: 'Revisar variante 2' })).toHaveAttribute('href', '/es/dashboard/content/reel-b');
  });

  it('un fallo de la generación usa el texto del locale y ofrece reintentar', async () => {
    searchParams = new URLSearchParams({ topic: 'Tema', type: 'post' });
    let calls = 0;
    stubFetch(() => items, (url) => {
      if (url === '/api/content/generate') {
        calls += 1;
        return jsonResponse({}, false, 500);
      }
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Generar Post' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo generar el contenido.');
    expect(alert).not.toHaveTextContent('Error al generar');

    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('si la portada falla lo dice y permite reintentarla', async () => {
    searchParams = new URLSearchParams({ topic: 'Tema', type: 'post' });
    let imageCalls = 0;
    stubFetch(() => items, (url) => {
      if (url === '/api/content/generate') {
        items = [makeItem({ id: 'post-1', image_url: null, image_status: null, body: 'Texto nuevo' })];
        return jsonResponse({ itemId: 'post-1', result: { body: 'Texto nuevo' } });
      }
      if (url === '/api/content/image') {
        imageCalls += 1;
        return jsonResponse({ error: 'AI down' }, false, 502);
      }
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Generar Post' }));
    expect(await screen.findByText(/No se pudo generar la imagen/)).toBeInTheDocument();
    expect(imageCalls).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar imagen' }));
    await waitFor(() => expect(imageCalls).toBe(2));
  });
});

describe('Mis contenidos — lista', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('tiene encabezado propio y cada tarjeta es un enlace al detalle', async () => {
    stubFetch(() => [makeItem()]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mis contenidos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Texto de un post existente' }))
      .toHaveAttribute('href', '/es/dashboard/content/item-1');
    // Las acciones de la tarjeta se nombran solas (no dependen del title).
    expect(screen.getByRole('button', { name: 'Editar: Texto de un post existente' })).toBeInTheDocument();
  });

  it('borrar pide confirmación con el diálogo de la app, no con confirm()', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    let deleted = false;
    stubFetch(() => (deleted ? [] : [makeItem()]), (url, init) => {
      if (url === '/api/content/item-1' && init?.method === 'DELETE') {
        deleted = true;
        return jsonResponse({ ok: true });
      }
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar: Texto de un post existente' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar este contenido?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByTestId('content-card')).not.toBeInTheDocument());
    expect(deleted).toBe(true);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('si el borrado falla lo avisa y conserva la tarjeta', async () => {
    stubFetch(() => [makeItem()], (url, init) => {
      if (url === '/api/content/item-1' && init?.method === 'DELETE') return jsonResponse({ error: 'nope' }, false, 500);
      return undefined;
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar: Texto de un post existente' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('No se pudo eliminar el contenido. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.getByTestId('content-card')).toBeInTheDocument();
  });

  it('con filtros y sin resultados ofrece quitarlos en vez de «no tienes contenido»', async () => {
    let requested = '';
    stubFetch(() => [], (url) => {
      if (url.startsWith('/api/content?')) {
        requested = url;
        return jsonResponse({ items: url.includes('status=') ? [] : [makeItem()] });
      }
      return undefined;
    });
    renderPage();

    await screen.findByTestId('content-card');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por estado' }), { target: { value: 'published' } });

    expect(await screen.findByText('No hay contenido con estos filtros')).toBeInTheDocument();
    expect(requested).toContain('status=published');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await screen.findByTestId('content-card');
  });
});
