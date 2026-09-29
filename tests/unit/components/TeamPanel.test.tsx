import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';

// ─── Equipo ───────────────────────────────────────────────────────────────────
//
// Eliminar a alguien pasa por el diálogo de la app (antes window.confirm, sin
// estilo ni traducción en móvil) y los errores del servidor —que llegan en
// español— se muestran con la copy del idioma de la interfaz.

import TeamPanel from '@/components/dashboard/TeamPanel';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const MEMBERS = [
  { userId: 'u1', role: 'owner', name: 'Ana', email: 'ana@example.com', isSelf: true },
  { userId: 'u2', role: 'member', name: 'Luis', email: 'luis@example.com', isSelf: false },
];

let invitePost: () => Response;
let deleteMember: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

function calls(method: string, prefix: string) {
  return fetchMock.mock.calls.filter(([u, init]) =>
    String(u).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method);
}

beforeEach(() => {
  invitePost = () => jsonResponse(201, { emailSent: true });
  deleteMember = () => jsonResponse(200, { ok: true });
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/team/members') return jsonResponse(200, { members: MEMBERS, limit: 5, used: 2 });
    if (url === '/api/team/invitations' && method === 'GET') return jsonResponse(200, { invitations: [] });
    if (url === '/api/team/invitations' && method === 'POST') return invitePost();
    if (url.startsWith('/api/team/members/') && method === 'DELETE') return deleteMember();
    return jsonResponse(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

async function renderPanel(locale: 'es' | 'en' = 'es', role = 'owner') {
  render(<TeamPanel locale={locale} role={role} />);
  await screen.findByText(locale === 'es' ? '2 de 5 lugares usados' : '2 of 5 seats used');
}

describe('TeamPanel — eliminar un miembro', () => {
  it('pide confirmación con el diálogo de la app, no con window.confirm', async () => {
    // happy-dom no trae window.confirm: se pone uno que aceptaría todo.
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal('confirm', nativeConfirm);
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Luis del equipo' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Eliminar a Luis del equipo?');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(calls('DELETE', '/api/team/members/')).toHaveLength(0);

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' })); });
    expect(calls('DELETE', '/api/team/members/')[0][0]).toBe('/api/team/members/u2');
  });

  it('cancelar no elimina', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Luis del equipo' }));
    const dialog = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' })); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls('DELETE', '/api/team/members/')).toHaveLength(0);
  });

  it('no se ofrece eliminar al dueño ni a uno mismo', async () => {
    await renderPanel();
    expect(screen.getAllByRole('button', { name: /Eliminar a/ })).toHaveLength(1);
  });

  it('un 403 (administrador quitando a otro) muestra la copy traducida, no el texto del servidor', async () => {
    deleteMember = () => jsonResponse(403, { error: 'Solo el dueño puede eliminar a un administrador' });
    await renderPanel('en');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Luis from the team' }));
    const dialog = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' })); });
    expect(await screen.findByText('Only the owner can remove an admin.')).toBeInTheDocument();
    expect(screen.queryByText(/Solo el dueño/)).toBeNull();
  });
});

describe('TeamPanel — invitar', () => {
  it('el correo y el rol tienen etiqueta, y se manda el idioma de la interfaz', async () => {
    await renderPanel();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'eva@example.com' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'admin' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invitar' })); });

    const [, init] = calls('POST', '/api/team/invitations')[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ email: 'eva@example.com', role: 'admin', lang: 'es' });
    expect(await screen.findByText('Invitación enviada a eva@example.com.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('');
  });

  it.each([
    [422, {}, 'Enter a valid email address.'],
    [409, {}, 'That person is already on your team.'],
    [403, { planLimitReached: true }, 'Your plan has no room for more members. Upgrade to invite someone else.'],
    [500, {}, 'Could not send the invitation. Please try again.'],
  ])('un %i se muestra en el idioma de la interfaz', async (status, extra, message) => {
    invitePost = () => jsonResponse(status, { error: 'Texto del servidor en español', ...extra });
    await renderPanel('en');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'eva@example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Invite' })); });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Texto del servidor en español')).toBeNull();
  });

  it('quien no gestiona el equipo no ve el formulario', async () => {
    await renderPanel('es', 'member');
    expect(screen.queryByLabelText('Correo electrónico')).toBeNull();
    expect(screen.getByText('Solo el dueño o un administrador pueden gestionar el equipo.')).toBeInTheDocument();
  });
});
