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
