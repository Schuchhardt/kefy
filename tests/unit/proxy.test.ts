// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { signAccessToken } from '@/lib/auth';

// El proxy exige la cookie de sesión en /api/**, salvo en una lista corta de
// rutas que se autentican solas. La API pública (/api/v1/**) y el servidor MCP
// (/api/mcp) están en esa lista porque llegan con `Authorization: Bearer
// kefy_sk_…` y sin cookie: el handler valida la API key. Todo lo demás tiene
// que seguir cortándose en el proxy aunque traiga un Bearer.
//
// Entorno node: el `Request` de happy-dom pierde cabeceras (Origin, Cookie).

const API_KEY = `kefy_sk_${'a'.repeat(40)}`;

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3099${path}`, {
    method: init.method ?? 'POST',
    headers: init.headers,
  });
}

/** NextResponse.next() marca la respuesta con esta cabecera. */
function passedThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

async function sessionCookie(): Promise<string> {
  const token = await signAccessToken({ userId: 'user-1', orgId: 'org-1', role: 'owner', plan: 'starter' });
  return `kefy_access=${token}`;
}

describe('proxy — rutas autenticadas con API key', () => {
  it.each([
    '/api/mcp',
    '/api/v1/me',
    '/api/v1/tools',
    '/api/v1/tools/create_post',
  ])('deja pasar %s con Bearer y sin cookie', async (path) => {
    const res = await proxy(req(path, { headers: { authorization: `Bearer ${API_KEY}` } }));
    expect(res.status).toBe(200);
    expect(passedThrough(res)).toBe(true);
  });

  it('no reenvía identidad de sesión a /api/mcp aunque haya cookie válida', async () => {
    const res = await proxy(req('/api/mcp', {
      headers: { authorization: `Bearer ${API_KEY}`, cookie: await sessionCookie() },
    }));
    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('x-user-id')).toBeNull();
    expect(res.headers.get('x-org-id')).toBeNull();
  });
});

describe('proxy — el Bearer no sirve fuera de /api/mcp y /api/v1/**', () => {
  it.each([
    '/api/content',
    '/api/assistant/chat',
    '/api/assistant/actions/abc',
    '/api/api-keys',
    '/api/api-keys/key-1',
    '/api/social/publish',
  ])('responde 401 en %s con Bearer de API key y sin cookie', async (path) => {
    const res = await proxy(req(path, { headers: { authorization: `Bearer ${API_KEY}` } }));
    expect(res.status).toBe(401);
    expect(passedThrough(res)).toBe(false);
  });

  it('responde 401 con un JWT de sesión válido en Bearer: el proxy solo mira la cookie', async () => {
    const token = await signAccessToken({ userId: 'user-1', orgId: 'org-1', role: 'owner', plan: 'starter' });
    const res = await proxy(req('/api/content', { headers: { authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(401);
  });

  // Los prefijos públicos se cortan en un límite de segmento: una ruta nueva
  // que empiece igual (/api/mcp-admin, /api/v10) no queda pública por accidente.
  it.each([
    '/api/v1',
    '/api/v10/tools',
    '/api/mcp-admin',
    '/api/mcpx',
    '/api/mcp2/tools',
  ])('responde 401 en %s, que solo se parece a una ruta pública', async (path) => {
    const res = await proxy(req(path, { headers: { authorization: `Bearer ${API_KEY}` } }));
    expect(res.status).toBe(401);
  });
});

describe('proxy — sesión por cookie', () => {
  it('deja pasar una ruta protegida con cookie válida y reenvía la identidad', async () => {
    const res = await proxy(req('/api/assistant/chat', { headers: { cookie: await sessionCookie() } }));
    expect(passedThrough(res)).toBe(true);
    expect(res.headers.get('x-user-id')).toBe('user-1');
    expect(res.headers.get('x-org-id')).toBe('org-1');
  });

  it('responde 401 con una cookie inválida', async () => {
    const res = await proxy(req('/api/api-keys', { method: 'GET', headers: { cookie: 'kefy_access=basura' } }));
    expect(res.status).toBe(401);
  });

  it('redirige el dashboard al login sin cookie', async () => {
    const res = await proxy(req('/es/dashboard', { method: 'GET' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3099/es/login');
  });

  it('un link profundo del dashboard sin sesión pasa por el login con ?next=', async () => {
    const res = await proxy(req('/es/dashboard/settings?connect=instagram&brand=b-1', { method: 'GET' }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/es/login');
    expect(location.searchParams.get('next')).toBe('/es/dashboard/settings?connect=instagram&brand=b-1');
  });

  it('con la sesión caducada también conserva el destino', async () => {
    const res = await proxy(req('/en/dashboard/automations/autopilot', { method: 'GET', headers: { cookie: 'kefy_access=basura' } }));
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('expired')).toBe('1');
    expect(location.searchParams.get('next')).toBe('/en/dashboard/automations/autopilot');
  });

  it('las rutas públicas de siempre siguen sin pedir cookie', async () => {
    for (const path of ['/api/auth/login', '/api/version', '/api/webhooks/stripe', '/api/team/invitations/accept']) {
      const res = await proxy(req(path));
      expect(passedThrough(res), path).toBe(true);
    }
  });
});
