import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContentItem } from '@/types/content';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useParams: () => ({ lang: 'es' }),
}));

// Los modales no participan del flujo bajo test y arrastran dependencias
// pesadas (Mux, Remotion), así que se stubean.
vi.mock('@/components/dashboard/content/ScheduleModal',       () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/EditContentModal',    () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/ManualCreateModal',   () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/RecommendModal',      () => ({ default: () => null }));
vi.mock('@/components/dashboard/content/ContentLibraryModal', () => ({ default: () => null }));

import ContentPage from '@/app/[lang]/dashboard/content/create/page';

const BODY_TEXT = 'Texto generado del post';
const IMAGE_URL = 'https://cdn.example.com/generated.jpeg';

const generatedItem: ContentItem = {
  id:           'item-1',
  channel:      'generic' as ContentItem['channel'],
  content_type: 'post',
  status:       'draft',
  title:        null,
  body:         BODY_TEXT,
  image_url:    null,
  image_status: null,
  hashtags:     [],
  slides:       null,
  video_url:    null,
  created_at:   new Date().toISOString(),
};

/** A promise plus its resolver, to hold a response open mid-test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/** Stand-in for the browser's Image loader: records every preloaded URL and
 *  lets the test decide when the download "finishes". */
class FakeImage {
  static instances: FakeImage[] = [];
  onload:  (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';
  set src(value: string) { this.#src = value; FakeImage.instances.push(this); }
  get src() { return this.#src; }
  finishLoading() { this.onload?.(); }
}

describe('Página de creación de contenido — imagen de portada', () => {
  let imageResponse: ReturnType<typeof deferred<Response>>;
  let serverItems: ContentItem[];

  beforeEach(() => {
    searchParams = new URLSearchParams({ topic: 'Tema de prueba', type: 'post' });
    serverItems  = [];
    imageResponse = deferred<Response>();
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/content?'))        return jsonResponse({ items: serverItems });
      if (url === '/api/content/generate')        return jsonResponse({ itemId: 'item-1', body: BODY_TEXT });
      if (url === '/api/content/image')           return imageResponse.promise;
      if (url.startsWith('/api/brand-kit'))       return jsonResponse({});
      if (url.startsWith('/api/automations'))     return jsonResponse({ rules: [] });
      if (url.startsWith('/api/content-library')) return jsonResponse({ items: [] });
      if (url.startsWith('/api/content/'))        return jsonResponse({ item: serverItems[0] });
      return jsonResponse({});
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  /** Generates a post and leaves the cover-image request in flight. */
  async function generatePost() {
    render(<ContentPage />);
    await waitFor(() => expect(screen.getByText('Generar Post')).toBeInTheDocument());
    // Al volver de /generate la lista ya trae el item (todavía sin imagen)
    serverItems = [generatedItem];
    fireEvent.click(screen.getByText('Generar Post'));
    await waitFor(() => expect(screen.getByText('Generando imagen…')).toBeInTheDocument());
  }

  /** Un item terminado se pinta como `content-card`; mientras le falte la
   *  imagen se pinta como `content-card-skeleton`. (El texto del post no
   *  sirve como señal: también aparece en el panel de resultado de la
   *  generación, fuera del listado.) */
  const cardIsRendered = () => screen.queryByTestId('content-card') !== null;

  // El bug original: la página leía `d.url` en vez de `d.image.url`, así que la
  // imagen nunca entraba al estado y solo aparecía al recargar la página.
  it('muestra la imagen sin recargar cuando la respuesta llega en image.url', async () => {
    await generatePost();

    imageResponse.resolve(jsonResponse({ image: { url: IMAGE_URL } }));
    await waitFor(() => expect(FakeImage.instances).toHaveLength(1));
    FakeImage.instances[0].finishLoading();

    await waitFor(() => {
      const img = document.querySelector(`img[src="${IMAGE_URL}"]`);
      expect(img).not.toBeNull();
    });
    expect(cardIsRendered()).toBe(true);
  });

  it('mantiene la tarjeta en estado de carga —sin texto— hasta que la imagen esté lista', async () => {
    await generatePost();

    // Mientras la imagen se genera, la tarjeta es un skeleton: nada de texto
    // del post junto a un thumbnail vacío.
    expect(cardIsRendered()).toBe(false);

    imageResponse.resolve(jsonResponse({ image: { url: IMAGE_URL } }));
    await waitFor(() => expect(FakeImage.instances).toHaveLength(1));

    // La URL ya llegó, pero el archivo aún se está descargando: la tarjeta
    // sigue cargando para no mostrar un <img> en blanco.
    expect(cardIsRendered()).toBe(false);
    expect(screen.getByText('Generando imagen…')).toBeInTheDocument();

    FakeImage.instances[0].finishLoading();

    // Descarga terminada → aparece todo junto: imagen y texto.
    await waitFor(() => expect(cardIsRendered()).toBe(true));
    expect(document.querySelector(`img[src="${IMAGE_URL}"]`)).not.toBeNull();
    expect(screen.queryByText('Generando imagen…')).not.toBeInTheDocument();
  });

  it('muestra progreso y estimación mientras genera la imagen', async () => {
    await generatePost();

    // Porcentaje + ETA, como en el loader del render de video.
    expect(screen.getByText(/^\d+% · ~\d+ s$/)).toBeInTheDocument();

    // El progreso es estimado por tiempo transcurrido: no puede anunciar 100 %
    // mientras el servidor sigue trabajando.
    const shown = Number(screen.getByText(/^\d+% · /).textContent!.match(/^(\d+)%/)![1]);
    expect(shown).toBeLessThan(100);
  });

  it('precarga la imagen antes de pintarla', async () => {
    await generatePost();

    imageResponse.resolve(jsonResponse({ image: { url: IMAGE_URL } }));
    await waitFor(() => expect(FakeImage.instances).toHaveLength(1));
    expect(FakeImage.instances[0].src).toBe(IMAGE_URL);
  });

  // Si la generación falla, la tarjeta debe salir del estado de carga: dejarla
  // cargando para siempre impide verla, editarla o borrarla.
  it('sale del estado de carga si la generación de imagen falla', async () => {
    await generatePost();

    imageResponse.resolve({ ok: false, status: 502, json: async () => ({ error: 'AI down' }) } as Response);

    await waitFor(() => expect(cardIsRendered()).toBe(true));
    expect(screen.queryByText('Generando imagen…')).not.toBeInTheDocument();
  });
});
