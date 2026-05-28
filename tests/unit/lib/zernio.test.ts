import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock global fetch antes de importar el módulo ───────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Importaciones luego del stub
const {
  getConnectUrl,
  publishPost,
  createProfile,
  listAccounts,
  connectAccount,
  disconnectAccount,
  getPostStatus,
  cancelPost,
  ZernioError,
} = await import('@/lib/zernio');

function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  });
}

function mockError(status: number, body: unknown = { message: 'error' }) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => body,
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── getConnectUrl ────────────────────────────────────────────────────────────

describe('getConnectUrl', () => {
  it('incluye la plataforma en el PATH, no en query params', async () => {
    mockOk({ authUrl: 'https://auth.example.com/oauth', state: 'state-abc' });

    await getConnectUrl('linkedin', 'profile-1', 'https://app.kefy.com/callback');

    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/connect/linkedin');
    const url = new URL(calledUrl);
    expect(url.searchParams.has('platform')).toBe(false);
  });

  it('incluye profileId y redirect_url en los query params', async () => {
    mockOk({ authUrl: 'https://auth.example.com/oauth', state: 'state-xyz' });

    await getConnectUrl('instagram', 'profile-99', 'https://app.kefy.com/callback');

    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.searchParams.get('profileId')).toBe('profile-99');
    expect(url.searchParams.get('redirect_url')).toBe('https://app.kefy.com/callback');
  });

  it('devuelve authUrl y state', async () => {
    mockOk({ authUrl: 'https://auth.example.com/oauth?foo=bar', state: 'my-state' });

    const result = await getConnectUrl('twitter', 'p1', 'https://callback.com');
    expect(result.authUrl).toBe('https://auth.example.com/oauth?foo=bar');
    expect(result.state).toBe('my-state');
  });

  it('lanza ZernioError en respuesta no-ok', async () => {
    mockError(401, { message: 'Invalid API key' });

    await expect(
      getConnectUrl('facebook', 'p1', 'https://callback.com'),
    ).rejects.toBeInstanceOf(ZernioError);
  });
});

// ─── publishPost ──────────────────────────────────────────────────────────────

describe('publishPost', () => {
  it('usa POST /posts', async () => {
    mockOk({ post_id: 'post-1', platform_post_id: null, status: 'published', published_at: null, scheduled_at: null });

    await publishPost({ account_id: 'acc-1', text: 'Hola mundo' });

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/posts');
    expect(init.method).toBe('POST');
  });

  it('incluye Authorization header', async () => {
    mockOk({ post_id: 'post-1', platform_post_id: null, status: 'published', published_at: null, scheduled_at: null });

    await publishPost({ account_id: 'acc-1', text: 'Test' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toMatch(/^Bearer /);
  });
});

// ─── createProfile ────────────────────────────────────────────────────────────

describe('createProfile', () => {
  it('con description: incluye el campo en el body', async () => {
    mockOk({ profile: { _id: 'p1', name: 'Marca X', description: 'Desc', created_at: '2024-01-01' } });

    await createProfile('Marca X', 'Una descripción');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.description).toBe('Una descripción');
  });

  it('sin description: NO incluye el campo en el body (no debe ser null)', async () => {
    mockOk({ profile: { _id: 'p1', name: 'Marca Y', description: null, created_at: '2024-01-01' } });

    await createProfile('Marca Y');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Object.prototype.hasOwnProperty.call(body, 'description')).toBe(false);
  });

  it('con description vacía: NO incluye el campo (vacío es falsy)', async () => {
    mockOk({ profile: { _id: 'p1', name: 'Marca Z', description: null, created_at: '2024-01-01' } });

    await createProfile('Marca Z', '');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(Object.prototype.hasOwnProperty.call(body, 'description')).toBe(false);
  });
});

// ─── listAccounts ─────────────────────────────────────────────────────────────

describe('listAccounts', () => {
  it('normaliza _id → id', async () => {
    mockOk({
      accounts: [
        { _id: 'zernio-123', platform: 'instagram', external_id: 'ig-1', username: '@test', avatar_url: null, access_token: 'tok', refresh_token: null, token_expires_at: null },
      ],
    });

    const accounts = await listAccounts();
    expect(accounts[0].id).toBe('zernio-123');
  });

  it('pasa profileId y platform como query params', async () => {
    mockOk({ accounts: [] });

    await listAccounts({ profileId: 'p-1', platform: 'linkedin' });

    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.searchParams.get('profileId')).toBe('p-1');
    expect(url.searchParams.get('platform')).toBe('linkedin');
  });
});

// ─── ZernioError ──────────────────────────────────────────────────────────────

describe('ZernioError', () => {
  it('conserva el statusCode', async () => {
    mockError(429, { message: 'Rate limited' });

    try {
      await getPostStatus('post-1');
      expect.fail('debería haber lanzado');
    } catch (err) {
      expect(err).toBeInstanceOf(ZernioError);
      expect((err as ZernioError).statusCode).toBe(429);
    }
  });

  it('usa el mensaje del body de error', async () => {
    mockError(404, { message: 'Post not found' });

    try {
      await getPostStatus('post-inexistente');
    } catch (err) {
      expect((err as ZernioError).message).toBe('Post not found');
    }
  });
});

// ─── disconnectAccount ────────────────────────────────────────────────────────

describe('disconnectAccount', () => {
  it('usa DELETE /accounts/{id}', async () => {
    mockOk(null);

    await disconnectAccount('acc-abc');

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/accounts/acc-abc');
    expect(init.method).toBe('DELETE');
  });
});

// ─── connectAccount ───────────────────────────────────────────────────────────

describe('connectAccount', () => {
  it('usa POST /accounts/connect con platform, code y redirect_uri', async () => {
    mockOk({ account: { id: 'acc-new' }, access_token: 'tok', refresh_token: null, expires_at: null });

    await connectAccount('tiktok', 'oauth-code-123', 'https://app.kefy.com/callback');

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/accounts/connect');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.platform).toBe('tiktok');
    expect(body.code).toBe('oauth-code-123');
    expect(body.redirect_uri).toBe('https://app.kefy.com/callback');
  });
});

// ─── cancelPost ───────────────────────────────────────────────────────────────

describe('cancelPost', () => {
  it('usa DELETE /posts/{id}', async () => {
    mockOk(null);

    await cancelPost('post-xyz');

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/posts/post-xyz');
    expect(init.method).toBe('DELETE');
  });
});
