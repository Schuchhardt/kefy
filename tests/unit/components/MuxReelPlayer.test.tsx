import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MuxReelPlayer } from '@/components/dashboard/MuxReelPlayer';

// El reproductor tenía ancho fijo (alto × 9/16: 360px con height=640, más que
// un móvil de 360px) y todos sus mensajes en español.

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('MuxReelPlayer', () => {
  it('es fluido: nunca más ancho que su contenedor y con proporción 9:16', () => {
    const { container } = render(
      <MuxReelPlayer itemId="i1" videoUrl="https://cdn.example.com/r.mp4" renderStatus="ready" height={640} maxHeight="50dvh" />,
    );
    const box = container.firstElementChild as HTMLElement;
    // Antes: width 360px + height 640px fijos. Ahora el ancho es
    // `min(360px, 100%, calc(50dvh * 9 / 16))` (happy-dom no entiende min(),
    // así que aquí solo se comprueba que ya no hay medidas fijas) y el alto
    // sale de la proporción.
    expect(box.style.width).not.toBe('360px');
    expect(box.style.height).toBe('');
    expect(box.style.aspectRatio).toBe('9 / 16');
  });

  it('si el render no arranca, lo dice en el idioma de la interfaz y permite reintentar', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 500));
    vi.stubGlobal('fetch', fetchMock);
    render(<MuxReelPlayer itemId="i1" renderStatus="not_rendered" lang="en" />);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start the render.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('muestra el mensaje del servidor cuando lo hay', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Sin créditos de render' }, false, 402)));
    render(<MuxReelPlayer itemId="i1" renderStatus="not_rendered" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin créditos de render');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
