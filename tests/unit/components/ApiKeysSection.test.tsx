import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const brands = [
  { id: 'brand-1', org_id: 'org-1', name: 'Café Andes', slug: 'cafe-andes', avatar_url: null, archived: false, created_at: '', updated_at: '' },
  { id: 'brand-2', org_id: 'org-1', name: 'Marca vieja', slug: 'vieja', avatar_url: null, archived: true, created_at: '', updated_at: '' },
];

vi.mock('@/lib/brand-context', () => ({
  useBrand: () => ({ brands, activeBrand: brands[0] }),
}));

import ApiKeysSection from '@/components/dashboard/settings/ApiKeysSection';

// ─── Datos ────────────────────────────────────────────────────────────────────

const SECRET = `kefy_sk_${'s3cr3t'.repeat(7)}`;

interface Row {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  brand_id: string | null;
  created_by: string | null;
  created_by_user: { name: string | null; email: string | null } | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  status: 'active' | 'revoked' | 'expired';
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'key-1',
    name: 'Claude Code',
    key_prefix: 'kefy_sk_ab12',
    scopes: ['read', 'write'],
    brand_id: null,
    created_by: 'user-1',
    created_by_user: { name: 'Ana', email: 'ana@example.com' },
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-09-01T00:00:00Z',
    status: 'active',
    ...over,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

let serverKeys: Row[];
let postResponse: () => Response;
let deleteResponse: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;
let clipboardWrite: ReturnType<typeof vi.fn>;

function callsTo(method: string, prefix: string) {
  return fetchMock.mock.calls.filter(([u, init]) =>
    String(u).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method);
}

beforeEach(() => {
  serverKeys = [row()];
  postResponse = () => {
    const created = row({ id: 'key-new', name: 'Cursor', key_prefix: 'kefy_sk_zz99', scopes: ['read', 'publish'] });
    serverKeys = [created, ...serverKeys];
    return jsonResponse(201, {
      key: { id: created.id, name: created.name, prefix: created.key_prefix, scopes: created.scopes, brand_id: null, expires_at: null, created_at: created.created_at },
      secret: SECRET,
    });
  };
  deleteResponse = () => new Response(null, { status: 204 });

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/api-keys' && method === 'GET') return jsonResponse(200, { keys: serverKeys });
    if (url === '/api/api-keys' && method === 'POST') return postResponse();
    if (url.startsWith('/api/api-keys/') && method === 'DELETE') return deleteResponse();
    return jsonResponse(404, { error: 'not mocked' });
  });
  vi.stubGlobal('fetch', fetchMock);

  clipboardWrite = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWrite }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

async function renderSection(lang: 'es' | 'en' = 'es') {
  const utils = render(<ApiKeysSection lang={lang} />);
  await waitFor(() => expect(screen.queryByText('Cargando…')).toBeNull());
  return utils;
}

async function openCreate() {
  fireEvent.click(screen.getByRole('button', { name: '+ Crear API key' }));
  return screen.findByRole('dialog');
}

async function createKey(name = 'Cursor', opts: { publish?: boolean; expiry?: string; brand?: string } = {}) {
  const dialog = await openCreate();
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: name } });
  if (opts.publish) fireEvent.click(within(dialog).getByRole('checkbox', { name: /Publicación/ }));
  if (opts.expiry) fireEvent.change(within(dialog).getByLabelText('Expiración'), { target: { value: opts.expiry } });
  if (opts.brand) fireEvent.change(within(dialog).getByLabelText('Marca'), { target: { value: opts.brand } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear key' }));
  });
  return dialog;
}

// ─── Lista ────────────────────────────────────────────────────────────────────

describe('ApiKeysSection — lista', () => {
  it('muestra nombre, prefijo, permisos, marca y creador de cada key activa, nunca un secreto', async () => {
    serverKeys = [
      row({ scopes: ['read', 'write'], brand_id: 'brand-1' }),
      row({ id: 'key-2', name: 'n8n', key_prefix: 'kefy_sk_cd34', scopes: ['read'], brand_id: 'brand-borrada', created_by_user: { name: null, email: 'luis@example.com' } }),
    ];
    await renderSection();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(within(items[0]).getByText('Claude Code')).toBeInTheDocument();
    expect(within(items[0]).getByText('kefy_sk_ab12…')).toBeInTheDocument();
    expect(within(items[0]).getByText('Lectura')).toBeInTheDocument();
    expect(within(items[0]).getByText('Escritura')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Café Andes');
    expect(items[0]).toHaveTextContent('Creada por Ana');
    expect(items[0]).toHaveTextContent('Nunca usada');
    expect(items[0]).toHaveTextContent('Sin expiración');

    // Marca que ya no existe y creador sin nombre.
    expect(items[1]).toHaveTextContent('Marca archivada');
    expect(items[1]).toHaveTextContent('Creada por luis@example.com');

    expect(document.body.textContent).not.toContain('kefy_sk_s3cr3t');
  });

  it('deja las revocadas y expiradas detrás de un conmutador, sin botón de revocar', async () => {
    serverKeys = [
      row(),
      row({ id: 'key-r', name: 'Vieja', status: 'revoked', revoked_at: '2026-09-02T00:00:00Z' }),
      row({ id: 'key-e', name: 'Caducada', status: 'expired', expires_at: '2026-09-03T00:00:00Z' }),
    ];
    await renderSection();

    expect(screen.queryByText('Vieja')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver revocadas y expiradas (2)' }));

    const vieja = screen.getByText('Vieja').closest('li')!;
    expect(within(vieja).getByText('Revocada')).toBeInTheDocument();
    expect(within(vieja).queryByRole('button', { name: 'Revocar' })).toBeNull();
    const caducada = screen.getByText('Caducada').closest('li')!;
    expect(within(caducada).getByText('Expirada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Revocar' })).toHaveLength(1);
  });

  it('estado vacío', async () => {
    serverKeys = [];
    await renderSection();
    expect(screen.getByText(/Aún no hay API keys/)).toBeInTheDocument();
  });

  it('un fallo al cargar se puede reintentar', async () => {
    let fail = true;
    const base = fetchMock.getMockImplementation() as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/api-keys' && fail) return jsonResponse(500, { error: 'boom' });
      return base(input, init);
    });
    await renderSection();

    expect(screen.getByText('No pudimos cargar las API keys.')).toBeInTheDocument();
    fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); });
    expect(await screen.findByText('kefy_sk_ab12…')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar las API keys.')).toBeNull();
  });

  it('con 10 keys activas no deja crear otra', async () => {
    serverKeys = Array.from({ length: 10 }, (_, i) => row({ id: `k${i}`, name: `Key ${i}` }));
    await renderSection();
    expect(screen.getByRole('button', { name: '+ Crear API key' })).toBeDisabled();
    expect(screen.getByText('Máximo 10 keys activas por organización.')).toBeInTheDocument();
  });

  it('muestra la URL del servidor MCP del origen actual', async () => {
    await renderSection();
    const url = `${window.location.origin}/api/mcp`;
    expect(await screen.findByText(url)).toBeInTheDocument();
  });
});

// ─── Crear y ver el secreto una sola vez ──────────────────────────────────────

describe('ApiKeysSection — crear', () => {
  it('manda nombre, permisos, marca, expiración e idioma', async () => {
    await renderSection();
    await createKey('  Cursor  ', { publish: true, expiry: '90', brand: 'brand-1' });

    const [call] = callsTo('POST', '/api/api-keys');
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      name: 'Cursor',
      scopes: ['read', 'publish'],
      brand_id: 'brand-1',
      expires_in_days: 90,
      lang: 'es',
    });
  });

  it('sin marca ni expiración no manda esos campos; las marcas archivadas no se ofrecen', async () => {
    await renderSection();
    const dialog = await openCreate();
    const brandSelect = within(dialog).getByLabelText('Marca');
    const options = within(brandSelect).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Todas las marcas', 'Café Andes']);

    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Solo lectura' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Crear key' })); });

    const body = JSON.parse(String((callsTo('POST', '/api/api-keys')[0][1] as RequestInit).body));
    expect(body).toEqual({ name: 'Solo lectura', scopes: ['read'], lang: 'es' });
  });

  it('marcar «Publicación» muestra el aviso de riesgo', async () => {
    await renderSection();
    const dialog = await openCreate();
    expect(within(dialog).queryByText(/sin confirmación humana/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Publicación/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('sin confirmación humana');
  });

  it('sin permisos no se puede enviar', async () => {
    await renderSection();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'X' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Lectura/ }));
    expect(within(dialog).getByRole('button', { name: 'Crear key' })).toBeDisabled();
  });

  it('muestra el secreto una sola vez: tras cerrar no vuelve a aparecer en ningún sitio', async () => {
    await renderSection();
    const dialog = await createKey('Cursor', { publish: true });

    // El secreto, el aviso y el título del paso de secreto.
    expect(await within(dialog).findByText(SECRET)).toBeInTheDocument();
    expect(within(dialog).getByText('Cópiala y guárdala en un lugar seguro. No la volverás a ver.')).toBeInTheDocument();
    expect(within(dialog).getByText('Tu nueva API key')).toBeInTheDocument();
    expect(within(dialog).getByText('Cursor · kefy_sk_zz99…')).toBeInTheDocument();

    // La lista se recarga con la key nueva, solo con su prefijo.
    await waitFor(() => expect(callsTo('GET', '/api/api-keys').length).toBeGreaterThanOrEqual(2));
    const list = screen.getAllByRole('list')[0];
    expect(await within(list).findByText('kefy_sk_zz99…')).toBeInTheDocument();
    expect(list.textContent).not.toContain(SECRET);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya la guardé' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);

    // Reabrir el modal empieza de cero: el formulario, no el secreto.
    const again = await openCreate();
    expect(within(again).getByText('Nueva API key')).toBeInTheDocument();
    expect(within(again).getByLabelText('Nombre')).toHaveValue('');
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('con el secreto a la vista, Esc y el clic fuera no cierran el modal', async () => {
    await renderSection();
    const dialog = await createKey();
    await within(dialog).findByText(SECRET);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText(SECRET)).toBeInTheDocument();

    const overlay = dialog.parentElement!;
    fireEvent.click(overlay);
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  it('el botón Copiar copia el secreto', async () => {
    await renderSection();
    const dialog = await createKey();
    await within(dialog).findByText(SECRET);

    const secretBox = within(dialog).getByText(SECRET).parentElement!;
    await act(async () => { fireEvent.click(within(secretBox).getByRole('button', { name: 'Copiar' })); });
    expect(clipboardWrite).toHaveBeenCalledWith(SECRET);
    expect(within(secretBox).getByRole('button', { name: '✓ Copiado' })).toBeInTheDocument();
  });

  it('409 (límite de keys) muestra copy traducida, no el inglés del servidor, y no muestra secreto', async () => {
    postResponse = () => jsonResponse(409, { error: 'Key limit reached (10)' });
    await renderSection();
    const dialog = await createKey();

    expect(await within(dialog).findByText('Llegaste al máximo de 10 keys activas. Revoca una para crear otra.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Key limit reached (10)')).toBeNull();
    expect(within(dialog).getByText('Nueva API key')).toBeInTheDocument();
  });

  it('404 (marca archivada en otra pestaña) muestra copy traducida, no «Brand not found»', async () => {
    postResponse = () => jsonResponse(404, { error: 'Brand not found' });
    await renderSection();
    const dialog = await createKey();

    expect(await within(dialog).findByText('Esa marca ya no existe o fue archivada. Elige otra.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Brand not found')).toBeNull();
  });

  it('422 muestra un aviso genérico del formulario, no los detalles técnicos', async () => {
    postResponse = () => jsonResponse(422, { error: 'Validation failed', issues: [{ path: ['name'] }] });
    await renderSection();
    const dialog = await createKey();
    expect(await within(dialog).findByText('Revisa los datos del formulario.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Validation failed')).toBeNull();
  });

  it('un 500 muestra el error genérico, aunque traiga texto', async () => {
    postResponse = () => jsonResponse(500, { error: 'stack trace: db exploded' });
    await renderSection();
    const dialog = await createKey();
    expect(await within(dialog).findByText('No se pudo crear la key.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/db exploded/)).toBeNull();
  });

  it('una respuesta 2xx sin secreto no finge que la key se creó', async () => {
    postResponse = () => jsonResponse(201, { key: { id: 'k', name: 'x', prefix: 'kefy_sk_x' } });
    await renderSection();
    const dialog = await createKey();
    expect(await within(dialog).findByText('No se pudo crear la key.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Tu nueva API key')).toBeNull();
  });
});

// ─── Revocar ──────────────────────────────────────────────────────────────────

describe('ApiKeysSection — revocar', () => {
  it('pide confirmación, manda DELETE y recarga la lista', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('«Claude Code» dejará de funcionar de inmediato');
    expect(callsTo('DELETE', '/api/api-keys/')).toHaveLength(0);

    serverKeys = [row({ status: 'revoked', revoked_at: '2026-09-23T00:00:00Z' })];
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, revocar' })); });

    expect(callsTo('DELETE', '/api/api-keys/')[0][0]).toBe('/api/api-keys/key-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revocar' })).toBeNull());
  });

  it('cancelar no revoca', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(callsTo('DELETE', '/api/api-keys/')).toHaveLength(0);
  });

  it('404 (ya revocada) cuenta como revocada', async () => {
    deleteResponse = () => jsonResponse(404, { error: 'Not found' });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, revocar' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('un fallo al revocar deja el modal abierto con el error', async () => {
    deleteResponse = () => jsonResponse(500, { error: 'boom' });
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, revocar' })); });
    expect(await within(dialog).findByText('No se pudo revocar la key.')).toBeInTheDocument();
  });
});
