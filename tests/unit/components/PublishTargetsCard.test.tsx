import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PublishTargetsCard from '@/components/dashboard/content/PublishTargetsCard';

// La tarjeta «Redes» de la ficha: dónde está el contenido y dónde más puede ir.

const target = (id: string, platform: string, state: string, extra: Record<string, unknown> = {}) => ({
  social_account_id: id, platform, username: id, avatar_url: null, state, other_formats: [], ...extra,
});

function stub(targets: unknown[]) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ targets }) }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('PublishTargetsCard', () => {
  it('publicado en Instagram: lo dice, explica por qué YouTube no y recomienda las demás', async () => {
    const fetchMock = stub([
      target('ig', 'instagram', 'published'),
      target('li', 'linkedin', 'scheduled', { scheduled_at: '2030-01-10T15:00:00Z' }),
      target('x', 'twitter', 'available'),
      target('th', 'threads', 'available'),
      target('yt', 'youtube', 'incompatible', { issue: 'video_only' }),
    ]);
    const onPublish = vi.fn();
    render(<PublishTargetsCard itemId="item-1" lang="es" refreshKey="a" onPublish={onPublish} />);

    expect(await screen.findByText('Publicado')).toBeTruthy();
    expect(screen.getByText(/^Programado · /)).toBeTruthy();
    expect(screen.getByText('Solo publica video')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/content/item-1/publish-targets', { credentials: 'include' });

    fireEvent.click(screen.getByRole('button', { name: 'Publicar en 2 cuentas más' }));
    expect(onPublish).toHaveBeenCalledWith(['x', 'th']);
  });

  it('un borrador ofrece publicarlo en todas las compatibles a la vez', async () => {
    stub([target('ig', 'instagram', 'available'), target('li', 'linkedin', 'available')]);
    const onPublish = vi.fn();
    render(<PublishTargetsCard itemId="item-1" lang="es" refreshKey="a" onPublish={onPublish} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar en las 2 compatibles' }));
    expect(onPublish).toHaveBeenCalledWith(['ig', 'li']);
  });

  it('ya está en todas las compatibles: lo dice y ofrece conectar otra red', async () => {
    stub([target('ig', 'instagram', 'published')]);
    render(<PublishTargetsCard itemId="item-1" lang="en" refreshKey="a" onPublish={() => {}} />);

    expect(await screen.findByText("It's already on all your compatible accounts.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connect another network' })).toHaveAttribute('href', '/en/dashboard/settings#social');
  });

  it('sin cuentas conectadas no se pinta', async () => {
    const fetchMock = stub([]);
    const { container } = render(<PublishTargetsCard itemId="item-1" lang="es" refreshKey="a" onPublish={() => {}} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});
