import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import PreviewAvatarImage, { avatarCandidates } from '@/components/dashboard/PreviewAvatarImage';

// El avatar de la vista previa es un círculo: usa la imagen cuadrada de la
// marca y, si no hay ninguna, muestra la que haya entera y más pequeña.

const SIZES: Record<string, [number, number]> = {
  'https://x/cuadrada.png':  [400, 400],
  'https://x/apaisada.png':  [1200, 300],
  'https://x/rota.png':      [0, 0],
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url: string) {
    const size = SIZES[url];
    queueMicrotask(() => {
      if (!size || url.includes('rota')) return this.onerror?.();
      [this.naturalWidth, this.naturalHeight] = size;
      this.onload?.();
    });
  }
}

describe('PreviewAvatarImage', () => {
  beforeEach(() => { vi.stubGlobal('Image', FakeImage); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('descarta vacíos y repetidos', () => {
    expect(avatarCandidates(['a', null, '', 'a', undefined, 'b'])).toEqual(['a', 'b']);
    expect(avatarCandidates(null)).toEqual([]);
  });

  it('prefiere la cuadrada aunque no sea la primera, y la usa a sangre', async () => {
    const { container } = render(
      <PreviewAvatarImage src={['https://x/apaisada.png', 'https://x/cuadrada.png']} alt="Marca" />,
    );
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://x/cuadrada.png');
    expect(img.style.objectFit).toBe('cover');
  });

  it('sin ninguna cuadrada muestra la primera entera y más pequeña', async () => {
    const { container } = render(
      <PreviewAvatarImage src={['https://x/rota.png', 'https://x/apaisada.png']} alt="Marca" />,
    );
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://x/apaisada.png');
    expect(img.style.objectFit).toBe('contain');
    expect(img.style.width).toBe('70%');
  });
});
