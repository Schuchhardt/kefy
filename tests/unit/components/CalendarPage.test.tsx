import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Calendario de publicaciones (auditoría UX 5.2 «Calendario», 5.5 y 5.6.5):
// - cada día es un botón con nombre (antes <div onClick> sin teclado);
// - un día vacío abre un panel con «Crear contenido» / «Programar un contenido
//   existente» en vez de saltar directo al modal de programar;
// - en el móvil, la agenda del mes sustituye a la rejilla de 7 columnas;
// - cancelar usa el diálogo de la app, no window.confirm;
// - el aviso «sin cuentas» enlazaba a un href relativo roto.

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'es' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/es/dashboard/content/calendar',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ activeBrand: { id: 'brand-1', name: 'Mi Marca' } }),
}));

vi.mock('@/components/dashboard/content/ScheduleModal', () => ({
  default: ({ open, initialDate }: { open: boolean; initialDate?: Date }) => (open
    ? <div data-testid="schedule-modal" data-date={initialDate ? initialDate.toISOString() : ''} />
    : null),
}));

import CalendarPage from '@/app/[lang]/dashboard/content/calendar/page';

const at = (d: number, h: number, m = 0, month = 8) => new Date(2026, month, d, h, m).toISOString();

const POSTS = [
  {
    id: 'p1', status: 'scheduled', scheduled_at: at(16, 9, 30), published_at: null, error_message: null, created_at: at(1, 9),
    kefy_content_items: { id: 'item-1', channel: 'generic', title: null, body: 'Lanzamos la nueva colección' },
    kefy_social_accounts: { id: 'sa-ig', platform: 'instagram', username: 'marca', avatar_url: null, status: 'active' },
  },
  {
    id: 'p2', status: 'scheduled', scheduled_at: at(16, 18), published_at: null, error_message: null, created_at: at(1, 9),
    kefy_content_items: { id: 'item-2', channel: 'generic', title: 'Webinar', body: null },
    kefy_social_accounts: { id: 'sa-li', platform: 'linkedin', username: 'marca_li', avatar_url: null, status: 'active' },
  },
  {
    id: 'p3', status: 'published', scheduled_at: at(10, 8), published_at: at(10, 8), error_message: null, created_at: at(1, 9),
    kefy_content_items: { id: 'item-3', channel: 'generic', title: null, body: 'Tres tips para captions' },
    kefy_social_accounts: { id: 'sa-ig', platform: 'instagram', username: 'marca', avatar_url: null, status: 'active' },
  },
  {
    id: 'p4', status: 'scheduled', scheduled_at: at(2, 12, 0, 9), published_at: null, error_message: null, created_at: at(1, 9),
    kefy_content_items: { id: 'item-4', channel: 'generic', title: 'Post de octubre', body: null },
    kefy_social_accounts: { id: 'sa-ig', platform: 'instagram', username: 'marca', avatar_url: null, status: 'active' },
  },
];

const ACCOUNTS = [{ id: 'sa-ig', platform: 'instagram', username: 'marca', status: 'active' }];

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderCalendar({ accounts = ACCOUNTS, posts = POSTS }: { accounts?: unknown[]; posts?: unknown[] } = {}) {
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/social/schedule?')) return jsonResponse({ posts });
    if (url.startsWith('/api/social/accounts')) return jsonResponse({ accounts });
    if (url.startsWith('/api/social/schedule/')) return jsonResponse({ ok: true });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return render(<CalendarPage />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CalendarPage — rejilla (escritorio)', () => {
  it('cada día es un botón con la fecha y el número de publicaciones', async () => {
    renderCalendar();
    const day = await screen.findByRole('button', { name: 'miércoles, 16 de septiembre, 2 publicaciones' });
    expect(day.tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: 'jueves, 10 de septiembre, 1 publicación' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'domingo, 20 de septiembre, sin publicaciones' })).toBeTruthy();
    // Hoy se marca como fecha actual.
    expect(screen.getByRole('button', { name: /^martes, 15 de septiembre/ })).toHaveAttribute('aria-current', 'date');
  });

  it('un día con publicaciones muestra su detalle debajo, con «Programar este día»', async () => {
    renderCalendar();
    const day = await screen.findByRole('button', { name: 'miércoles, 16 de septiembre, 2 publicaciones' });
    fireEvent.click(day);
    expect(day).toHaveAttribute('aria-pressed', 'true');

    const detail = screen.getByRole('region', { name: /miércoles, 16 de septiembre de 2026/i });
    expect(within(detail).getByText('Lanzamos la nueva colección')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Programar este día' }));
    const modal = screen.getByTestId('schedule-modal');
    const date = new Date(modal.dataset.date!);
    expect([date.getDate(), date.getHours()]).toEqual([16, 9]);
  });

  it('un día vacío abre un panel con «Crear contenido» y «Programar un contenido existente» (no el modal directo)', async () => {
    renderCalendar();
    fireEvent.click(await screen.findByRole('button', { name: 'domingo, 20 de septiembre, sin publicaciones' }));

    expect(screen.queryByTestId('schedule-modal')).toBeNull();
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('No hay nada programado este día')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: /crear contenido/i })).toHaveAttribute('href', '/es/dashboard/content/create?new=1');

    fireEvent.click(within(panel).getByRole('button', { name: /programar un contenido existente/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const date = new Date(screen.getByTestId('schedule-modal').dataset.date!);
    expect([date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([8, 20, 9, 0]);
  });

  it('navegar de mes: flechas con nombre y «Hoy» para volver', async () => {
    renderCalendar();
    expect(await screen.findByRole('heading', { name: 'Septiembre 2026' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hoy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(screen.getByRole('heading', { name: 'Octubre 2026' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(screen.getByRole('heading', { name: 'Septiembre 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeTruthy();
  });
});

describe('CalendarPage — agenda (móvil)', () => {
  it('lista lo programado del mes agrupado por día, con enlace a cada contenido', async () => {
    renderCalendar();
    const agenda = await screen.findByRole('list', { name: 'Agenda de septiembre' });

    const days = within(agenda).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(days).toEqual(['jueves, 10 de septiembre', 'miércoles, 16 de septiembre']);

    expect(within(agenda).getByRole('link', { name: 'Lanzamos la nueva colección' })).toHaveAttribute('href', '/es/dashboard/content/item-1');
    expect(within(agenda).getByRole('link', { name: 'Webinar' })).toHaveAttribute('href', '/es/dashboard/content/item-2');
    // Lo de octubre no se cuela en septiembre.
    expect(within(agenda).queryByText('Post de octubre')).toBeNull();
    // El estado sale con su texto, no solo con un color.
    expect(within(agenda).getByText('Publicado')).toBeTruthy();
  });

  it('un mes sin nada programado ofrece programar o crear', async () => {
    renderCalendar({ posts: [] });
    expect(await screen.findByText('Nada programado en septiembre')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: /crear contenido/i });
    expect(links[0]).toHaveAttribute('href', '/es/dashboard/content/create?new=1');
  });
});

describe('CalendarPage — acciones', () => {
  it('cancelar pide confirmación con el diálogo de la app y hace PATCH', async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    renderCalendar();
    const agenda = await screen.findByRole('list', { name: 'Agenda de septiembre' });
    fireEvent.click(within(agenda).getAllByRole('button', { name: 'Cancelar publicación' })[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('¿Cancelar esta publicación programada?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar publicación' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/api/social/schedule/p1');
      expect(call).toBeTruthy();
      expect((call![1] as RequestInit).method).toBe('PATCH');
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ status: 'cancelled' });
    });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('«Mantener» no cancela nada', async () => {
    renderCalendar();
    const agenda = await screen.findByRole('list', { name: 'Agenda de septiembre' });
    fireEvent.click(within(agenda).getAllByRole('button', { name: 'Cancelar publicación' })[0]);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Mantener' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/social/schedule/p'))).toBe(false);
  });

  it('sin cuentas, el aviso enlaza a Ajustes › Redes (antes: href relativo que daba 404)', async () => {
    renderCalendar({ accounts: [] });
    const link = await screen.findByRole('link', { name: 'Conectar cuentas' });
    expect(link).toHaveAttribute('href', '/es/dashboard/settings#social');
  });
});
