import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';

// ─── Mi perfil ────────────────────────────────────────────────────────────────
//
// Es el único sitio donde se edita el nombre (Ajustes solo lo muestra). Los
// errores de /api/auth/me llegan en español: la página muestra su propia copy.

let lang = 'es';

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const refresh = vi.fn(async () => {});
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', name: 'Ana Pérez' },
    org: { id: 'o1', name: 'Café Andes', slug: 'cafe-andes', plan: 'pro' },
    role: 'admin',
    plan: 'pro',
    subscription: null,
    usage: null,
    loading: false,
    refresh,
    logout: vi.fn(),
  }),
}));

import ProfilePage from '@/app/[lang]/dashboard/profile/page';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

let patchResponse: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  lang = 'es';
  refresh.mockClear();
  patchResponse = () => jsonResponse(200, { ok: true });
  fetchMock = vi.fn(async () => patchResponse());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function patchBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe('Mi perfil', () => {
  it('edita el nombre con su etiqueta y refresca la sesión', async () => {
    render(<ProfilePage />);
    const name = screen.getByLabelText('Nombre');
    expect(name).toHaveValue('Ana Pérez');
    fireEvent.change(name, { target: { value: 'Ana P.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); });

    expect(patchBodies()).toEqual([{ name: 'Ana P.' }]);
    expect(refresh).toHaveBeenCalled();
    const info = document.getElementById('personal-info')!;
    expect(within(info).getByRole('status')).toHaveTextContent('Cambios guardados');
  });

  it('el correo no se puede cambiar y lo dice junto al campo', () => {
    render(<ProfilePage />);
    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toBeDisabled();
    expect(email).toHaveAccessibleDescription('El correo no se puede cambiar.');
  });

  it('«no coinciden» aparece al salir del campo, no con la primera letra', () => {
    render(<ProfilePage />);
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'nueva-clave-1' } });
    const confirm = screen.getByLabelText('Confirmar nueva contraseña');
    fireEvent.change(confirm, { target: { value: 'n' } });
    expect(screen.queryByText('Las contraseñas no coinciden.')).toBeNull();

    fireEvent.blur(confirm);
    expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
  });

  it('una contraseña actual incorrecta se explica en el idioma de la interfaz', async () => {
    lang = 'en';
    patchResponse = () => jsonResponse(400, { error: 'Contraseña actual incorrecta' });
    render(<ProfilePage />);
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'vieja' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'nueva-clave-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'nueva-clave-1' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Change password' })); });

    expect(patchBodies()).toEqual([{ current_password: 'vieja', new_password: 'nueva-clave-1' }]);
    expect(await screen.findByText('Your current password is not correct.')).toBeInTheDocument();
    expect(screen.queryByText('Contraseña actual incorrecta')).toBeNull();
  });

  it('la organización se ve aquí pero se gestiona en Ajustes', () => {
    render(<ProfilePage />);
    const org = document.getElementById('organization')!;
    expect(org).toHaveTextContent('Café Andes');
    expect(org).toHaveTextContent('Administrador');
    expect(within(org).queryByRole('textbox')).toBeNull();
    expect(within(org).getByRole('link', { name: 'Gestionar en Ajustes' })).toHaveAttribute('href', '/es/dashboard/settings#org');
  });
});
