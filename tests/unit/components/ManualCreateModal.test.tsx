import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManualCreateModal from '@/components/dashboard/content/ManualCreateModal';

// «Crear sin IA»: textos en el locale (antes un diccionario en línea y el
// canal «Generic» en inglés también para usuarios en español), campos con
// nombre accesible y subida de archivos alcanzable con el teclado.

function renderModal(lang: 'es' | 'en' = 'es') {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<ManualCreateModal open lang={lang} onClose={onClose} onCreated={onCreated} />);
  return { onCreated, onClose };
}

describe('<ManualCreateModal />', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('en español el canal genérico no sale en inglés', () => {
    renderModal('es');
    expect(screen.getByRole('button', { name: 'Genérico' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Generic' })).not.toBeInTheDocument();
  });

  it('está traducido al inglés', () => {
    renderModal('en');
    expect(screen.getByRole('dialog', { name: 'Create content without AI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carousel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument();
  });

  it('los campos tienen etiqueta asociada', () => {
    renderModal('es');
    expect(screen.getByRole('textbox', { name: /Título/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Hashtags/ })).toBeInTheDocument();
  });

  it('el tipo elegido se marca con aria-pressed', () => {
    renderModal('es');
    fireEvent.click(screen.getByRole('button', { name: 'Carrusel' }));
    expect(screen.getByRole('button', { name: 'Carrusel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Post' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('un carrusel sin slides explica qué falta y no llama a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal('es');
    fireEvent.click(screen.getByRole('button', { name: 'Carrusel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Añade al menos 1 slide');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('crea el contenido con los datos escritos', async () => {
    const created = { id: 'm-1', content_type: 'post', channel: 'generic', status: 'draft' };
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ item: created }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { onCreated } = renderModal('es');

    fireEvent.change(screen.getByRole('textbox', { name: 'Texto' }), { target: { value: 'Hola mundo' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Hashtags/ }), { target: { value: 'uno, #dos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ content_type: 'post', body: 'Hola mundo', hashtags: ['#uno', '#dos'] });
  });

  it('si la API falla sin mensaje, el error sale en el idioma de la interfaz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response));
    renderModal('en');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The content could not be created.');
  });
});
