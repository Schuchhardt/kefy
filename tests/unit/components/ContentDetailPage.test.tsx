import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ContentItem } from '@/types/content';

// Vista de detalle (/dashboard/content/[itemId]): textos desde
// locales/*/dashboard/content-detail.ts, estado con StatusBadge (antes un
// STATUS_COLORS propio con `${color}22`) y borrar con el diálogo de la app en
// vez de window.confirm().

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'es', itemId: 'item-1' }),
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/es/dashboard/content/item-1',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/components/dashboard/MuxReelPlayer', () => ({ MuxReelPlayer: () => <div data-testid="reel-player" /> }));
vi.mock('@/components/dashboard/content/ScheduleModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="schedule-modal" /> : null),
}));
vi.mock('@/components/dashboard/content/EditContentModal', () => ({ default: () => null }));

import ContentDetailPage from '@/app/[lang]/dashboard/content/[itemId]/page';

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'item-1', channel: 'generic' as ContentItem['channel'], content_type: 'post', status: 'approved',
    title: 'Cinco errores en redes', body: 'Cuerpo', image_url: null, image_status: null, hashtags: [],
    slides: null, video_url: null, created_at: '2026-09-20T10:00:00.000Z', metadata: { created_via: 'chat' },
    ...overrides,
  } as ContentItem;
}

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderPage(current: ContentItem, { deleteOk = true } = {}) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/content/item-1' && init?.method === 'DELETE') return jsonResponse({}, deleteOk, deleteOk ? 200 : 500);
    if (url.startsWith('/api/content/item-1')) return jsonResponse({ item: current });
    if (url.startsWith('/api/brand-kit')) return jsonResponse({ kit: null });
    if (url.startsWith('/api/analytics/posts')) {
      return jsonResponse({ data: [{
        scheduled_post_id: 's1', platform: 'instagram', published_at: '2026-09-21T10:00:00.000Z',
        latest_metrics: { measured_at: '', impressions: 12840, reach: 9310, likes: 402, comments: 37, shares: 21, clicks: 0, saves: 0, engagement_rate: 0.0461 },
      }] });
    }
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return render(<ContentDetailPage />);
}

beforeEach(() => { push.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ContentDetailPage', () => {
  it('cabecera: título como h1, estado con StatusBadge y origen traducido', async () => {
    renderPage(item());
    expect(await screen.findByRole('heading', { level: 1, name: 'Cinco errores en redes' })).toBeTruthy();
    expect(screen.getByText('Aprobado')).toHaveClass('ui-badge');
    expect(screen.getByText('Todas las redes')).toBeTruthy();
    expect(screen.getByText(/vía Asistente/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /volver a contenido/i })).toHaveAttribute('href', '/es/dashboard/content/create');
  });

  it('eliminar pide confirmación con el diálogo de la app y después navega', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    renderPage(item());
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('¿Eliminar este contenido?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/es/dashboard/content/create'));
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/content/item-1' && (init as RequestInit)?.method === 'DELETE')).toBe(true);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('si el borrado falla, avisa y no navega', async () => {
    renderPage(item(), { deleteOk: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('No se pudo eliminar el contenido. Inténtalo de nuevo.')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('«Publicar o programar» abre el modal de publicación', async () => {
    renderPage(item());
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar o programar' }));
    expect(screen.getByTestId('schedule-modal')).toBeTruthy();
  });

  it('publicado: métricas con formato local y «Crear uno similar»', async () => {
    renderPage(item({ status: 'published' }));
    expect(await screen.findByRole('heading', { name: 'Rendimiento' })).toBeTruthy();
    expect(await screen.findByText('12.840')).toBeTruthy();
    expect(screen.getByText('4.6%')).toBeTruthy();
    expect(screen.getByRole('link', { name: /crear uno similar/i }).getAttribute('href'))
      .toBe('/es/dashboard/content/create?topic=Cinco%20errores%20en%20redes&type=post');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });

  it('no encontrado: estado vacío con acción para volver', async () => {
    fetchMock = vi.fn(async () => jsonResponse({}, false, 404));
    vi.stubGlobal('fetch', fetchMock);
    render(<ContentDetailPage />);
    expect(await screen.findByText('No se encontró este contenido')).toBeTruthy();
    expect(screen.getByRole('link', { name: /volver a contenido/i })).toHaveAttribute('href', '/es/dashboard/content/create');
  });
});
