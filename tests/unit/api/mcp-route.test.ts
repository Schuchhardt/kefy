// @vitest-environment node
//
// Entorno node a propósito: el Request de happy-dom descarta la cabecera
// Origin, y el caso 403 pasaría en silencio como 200.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../helpers/quota';
import { IDS, seedWorkspace } from '../helpers/assistant';
import { registerTestTools, testToolCalls } from '../helpers/test-tools';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { POST, GET, DELETE } from '@/app/api/mcp/route';
import { generateApiKey } from '@/lib/assistant/api-keys';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { SUPPORTED_PROTOCOL_VERSIONS, JSONRPC_ERRORS, MCP_INSTRUCTIONS } from '@/lib/assistant/mcp';

let secret = '';

function seedKey(over: Record<string, unknown> = {}) {
  const k = generateApiKey();
  secret = k.raw;
  db.seed('kefy_api_keys', [{
    id: IDS.KEY, org_id: IDS.ORG, created_by: IDS.USER, name: 'Claude', key_prefix: k.prefix, key_hash: k.hash,
    scopes: ['read', 'write'], brand_id: IDS.BRAND, ...over,
  }]);
}

function mcp(body: unknown, { headers = {}, token = secret as string | null } = {}) {
  return POST(new NextRequest('http://localhost:3099/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

const rpc = (method: string, params?: unknown, id: unknown = 1) =>
  ({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) });

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  testToolCalls.length = 0;
  ensureToolsRegistered();
  registerTestTools();
  seedWorkspace(db);
  seedKey();
});

// ─── Transporte ──────────────────────────────────────────────────────────────

describe('transporte HTTP', () => {
  it('un Origin ajeno → 403 (protección contra DNS rebinding), antes de autenticar', async () => {
    const res = await mcp(rpc('ping'), { headers: { origin: 'https://evil.example' }, token: null });
    expect(res.status).toBe(403);
  });

  it('el Origin de la propia app se acepta; sin Origin también (clientes de escritorio)', async () => {
    expect((await mcp(rpc('ping'), { headers: { origin: 'http://localhost:3099' } })).status).toBe(200);
    expect((await mcp(rpc('ping'))).status).toBe(200);
  });

  it('una MCP-Protocol-Version que no hablamos → 400', async () => {
    const res = await mcp(rpc('ping'), { headers: { 'mcp-protocol-version': '1999-01-01' } });
    expect(res.status).toBe(400);
  });

  it.each(SUPPORTED_PROTOCOL_VERSIONS)('la versión %s se acepta', async (v) => {
    expect((await mcp(rpc('ping'), { headers: { 'mcp-protocol-version': v } })).status).toBe(200);
  });

  it('sin key → 401 con WWW-Authenticate invalid_token', async () => {
    const res = await mcp(rpc('initialize', { protocolVersion: '2025-06-18' }), { token: null });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm="kefy", error="invalid_token"');
  });

  it('una key inválida o revocada → 401', async () => {
    expect((await mcp(rpc('ping'), { token: generateApiKey().raw })).status).toBe(401);

    db.rows('kefy_api_keys')[0].revoked_at = new Date().toISOString();
    expect((await mcp(rpc('ping'))).status).toBe(401);
  });

  it('GET y DELETE → 405 con Allow: POST (no hay stream del servidor ni sesiones)', async () => {
    for (const res of [await GET(), await DELETE()]) {
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST');
    }
  });

  it('las respuestas no se cachean', async () => {
    expect((await mcp(rpc('ping'))).headers.get('Cache-Control')).toBe('no-store');
  });
});

// ─── JSON-RPC ────────────────────────────────────────────────────────────────

describe('JSON-RPC', () => {
  it('JSON inválido → -32700 (HTTP 200)', async () => {
    const res = await mcp('{nope');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: JSONRPC_ERRORS.parseError } });
  });

  it('un lote (array) → -32600', async () => {
    const res = await mcp([rpc('ping'), rpc('ping', undefined, 2)]);
    expect((await res.json()).error.code).toBe(JSONRPC_ERRORS.invalidRequest);
  });

  it('sin jsonrpc: "2.0" → -32600', async () => {
    const res = await mcp({ id: 1, method: 'ping' });
    expect((await res.json()).error.code).toBe(JSONRPC_ERRORS.invalidRequest);
  });

  it('un id de tipo inválido → -32600', async () => {
    const res = await mcp({ jsonrpc: '2.0', id: { x: 1 }, method: 'ping' });
    expect((await res.json()).error.code).toBe(JSONRPC_ERRORS.invalidRequest);
  });

  it('método desconocido → -32601 con el mismo id', async () => {
    const body = await (await mcp(rpc('resources/list', {}, 'abc'))).json();
    expect(body).toMatchObject({ id: 'abc', error: { code: JSONRPC_ERRORS.methodNotFound } });
  });

  it('params que no son un objeto → -32602', async () => {
    const body = await (await mcp(rpc('tools/list', [1, 2]))).json();
    expect(body.error.code).toBe(JSONRPC_ERRORS.invalidParams);
  });

  it('una notificación → 202 sin cuerpo', async () => {
    const res = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('una respuesta del cliente → 202 sin cuerpo', async () => {
    const res = await mcp({ jsonrpc: '2.0', id: 5, result: {} });
    expect(res.status).toBe(202);
  });

  it('ping → {}', async () => {
    expect(await (await mcp(rpc('ping', undefined, 7))).json()).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });
});

describe('initialize', () => {
  it('acepta la versión pedida si la hablamos y anuncia solo tools', async () => {
    const body = await (await mcp(rpc('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' },
    }))).json();

    expect(body.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'kefy' },
      instructions: MCP_INSTRUCTIONS,
    });
    expect(body.result.capabilities.resources).toBeUndefined();
  });

  it('ante una versión desconocida ofrece la más reciente', async () => {
    const body = await (await mcp(rpc('initialize', { protocolVersion: '2030-01-01' }))).json();
    expect(body.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('las instrucciones avisan de que el contenido de terceros son datos', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/third parties/);
  });
});

describe('tools/list', () => {
  it('lista las herramientas de los scopes de la key con anotaciones', async () => {
    const { result } = await (await mcp(rpc('tools/list', {}))).json();
    const names = result.tools.map((t: { name: string }) => t.name);

    expect(names).toContain('test_echo');
    expect(names).toContain('test_write');
    // La key no tiene 'publish'.
    expect(names).not.toContain('test_publish');
    expect(names).not.toContain('publish_content');
    expect(names).not.toContain('open_page');

    const echo = result.tools.find((t: { name: string }) => t.name === 'test_echo');
    expect(echo.inputSchema.type).toBe('object');
    expect(echo.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const write = result.tools.find((t: { name: string }) => t.name === 'test_write');
    expect(write.annotations.readOnlyHint).toBe(false);
  });

  it('una key con publish ve las herramientas destructivas marcadas como tales', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read', 'write', 'publish'];
    const { result } = await (await mcp(rpc('tools/list'))).json();
    const pub = result.tools.find((t: { name: string }) => t.name === 'test_publish');
    expect(pub.annotations.destructiveHint).toBe(true);
  });
});

describe('tools/call', () => {
  it('éxito: structuredContent {data, links} y el mismo JSON en el bloque de texto', async () => {
    const { result } = await (await mcp(rpc('tools/call', { name: 'test_echo', arguments: { text: 'hola' } }))).json();

    expect(result.isError).toBe(false);
    expect(result.structuredContent.data).toEqual({ echo: 'hola', brand_id: IDS.BRAND });
    expect(result.structuredContent.links[0].href).toMatch(/^https?:\/\//);
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(testToolCalls[0]).toMatchObject({ source: 'mcp' });
  });

  it('un error de la herramienta es un resultado isError (no un error JSON-RPC), legible para el modelo', async () => {
    const { result, error } = await (await mcp(rpc('tools/call', { name: 'test_write', arguments: { text: '' } }))).json();

    expect(error).toBeUndefined();
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toMatchObject({ code: 'invalid_input' });
    expect(result.structuredContent.issues).toBeDefined();
    expect(result.content[0].text.startsWith('invalid_input: ')).toBe(true);
  });

  it('un scope que falta es isError scope_denied', async () => {
    const { result } = await (await mcp(rpc('tools/call', { name: 'test_publish', arguments: { text: 'x' } }))).json();
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe('scope_denied');
    expect(testToolCalls).toHaveLength(0);
  });

  it('fuera del chat no hay confirmación humana: publicar con scope se ejecuta', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read', 'write', 'publish'];
    const { result } = await (await mcp(rpc('tools/call', { name: 'test_publish', arguments: { text: 'x' } }))).json();
    expect(result.isError).toBe(false);
    expect(db.rows('kefy_assistant_actions')[0]).toMatchObject({ source: 'mcp', status: 'succeeded' });
  });

  it.each([
    ['herramienta desconocida', { name: 'no_existe', arguments: {} }],
    ['herramienta exclusiva del chat', { name: 'open_page', arguments: { page: 'home' } }],
    ['sin nombre', { arguments: {} }],
    ['arguments que no es un objeto', { name: 'test_echo', arguments: 'hola' }],
  ])('%s → -32602', async (_n, params) => {
    const body = await (await mcp(rpc('tools/call', params))).json();
    expect(body.error.code).toBe(JSONRPC_ERRORS.invalidParams);
    expect(testToolCalls).toHaveLength(0);
  });

  it('_meta.idempotencyKey evita ejecutar dos veces', async () => {
    const call = () => mcp(rpc('tools/call', { name: 'test_write', arguments: { text: 'x' }, _meta: { idempotencyKey: 'mcp-1' } }));

    const a = await (await call()).json();
    const b = await (await call()).json();

    expect(b.result).toEqual(a.result);
    expect(testToolCalls).toHaveLength(1);
  });

  it('una key atada no puede elegir otra marca con brand_id', async () => {
    const { result } = await (await mcp(rpc('tools/call', {
      name: 'test_echo', arguments: { text: 'x', brand_id: IDS.BRAND_2 },
    }))).json();
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe('forbidden');
  });

  it('brand_required incluye la lista de marcas en el texto y en structuredContent', async () => {
    db.rows('kefy_api_keys')[0].brand_id = null;

    const { result } = await (await mcp(rpc('tools/call', { name: 'test_echo', arguments: { text: 'x' } }))).json();

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe('brand_required');
    expect(result.structuredContent.brands).toHaveLength(2);
    expect(result.content[0].text).toContain(IDS.BRAND);
  });
});
