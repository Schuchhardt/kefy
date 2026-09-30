import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContentItem } from '@/types/content';

// Auditoría UX 5.2/5.5: los botones de cada slide medían 24px y su único
// nombre era «↑», «↓» o «×»; los campos no tenían etiqueta asociada; los
// fallos de la IA se perdían sin aviso.

vi.mock('@/components/dashboard/MuxReelPlayer', () => ({
  MuxReelPlayer: () => <div data-testid="reel-player" />,
}));

import EditContentModal from '@/components/dashboard/content/EditContentModal';

function carouselItem(): ContentItem {
  return {
    id: 'item-c', channel: 'generic' as ContentItem['channel'], content_type: 'carousel', status: 'draft',
    title: null, body: 'Caption del carrusel', image_url: null, image_status: null, hashtags: [],
    slides: [
      { slide_order: 1, title: 'Primero', body: 'Uno', image_url: null },
      { slide_order: 2, title: 'Segundo', body: 'Dos', image_url: null },
    ],
    video_url: null, created_at: new Date().toISOString(),
  } as ContentItem;
}

function postItem(): ContentItem {
  return {
    id: 'item-p', channel: 'generic' as ContentItem['channel'], content_type: 'post', status: 'draft',
    title: 'Título', body: 'Texto del post', image_url: null, image_status: null, hashtags: ['#uno'],
    slides: null, video_url: null, created_at: new Date().toISOString(),
  } as ContentItem;
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('EditContentModal — slides', () => {
  it('subir / bajar / eliminar tienen nombre y el primero no se puede subir', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ item: {} })));
    render(<EditContentModal open onClose={() => {}} item={carouselItem()} lang="es" onUpdate={() => {}} />);

    expect(screen.getByRole('button', { name: 'Subir slide 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar slide 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar slide 2' })).toBeEnabled();
  });

  it('bajar el primer slide lo guarda en el nuevo orden', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ item: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const onUpdate = vi.fn();
    render(<EditContentModal open onClose={() => {}} item={carouselItem()} lang="es" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bajar slide 1' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/content/item-c' && init?.method === 'PATCH');
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body as string);
      expect(body.slides.map((s: { title: string }) => s.title)).toEqual(['Segundo', 'Primero']);
    }, { timeout: 2000 });
  });

  it('el encabezado del slide es un botón que despliega sus campos con etiqueta', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<EditContentModal open onClose={() => {}} item={carouselItem()} lang="es" onUpdate={() => {}} />);

    const toggle = screen.getByRole('button', { name: /^Primero/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Primero');
    expect((screen.getByLabelText('Cuerpo') as HTMLTextAreaElement).value).toBe('Uno');
  });
});

describe('EditContentModal — campos y errores', () => {
  it('los campos del post tienen etiqueta asociada', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    render(<EditContentModal open onClose={() => {}} item={postItem()} lang="es" onUpdate={() => {}} />);
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Título');
    expect((screen.getByLabelText('Texto') as HTMLTextAreaElement).value).toBe('Texto del post');
    expect((screen.getByLabelText('Hashtags') as HTMLInputElement).value).toBe('#uno');
  });

  it('si la IA falla al regenerar el texto, lo dice junto al botón', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/content/generate'
      ? jsonResponse({ error: 'Sin créditos este mes' }, false, 402)
      : jsonResponse({}))));
    render(<EditContentModal open onClose={() => {}} item={postItem()} lang="es" onUpdate={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Regenerar' })[0]);
    expect(await screen.findByText('Sin créditos este mes')).toBeTruthy();
  });

  it('«Listo» cierra el editor', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    const onClose = vi.fn();
    render(<EditContentModal open onClose={onClose} item={postItem()} lang="en" onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
