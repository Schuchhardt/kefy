// @vitest-environment node
//
// MCP Apps de punta a punta por /api/mcp: recursos ui://, `_meta.ui` y
// `outputSchema` en tools/list, la vista en structuredContent y — lo más
// importante — que el `content[].text` que ve el modelo (y un cliente sin
// MCP Apps) no cambie. Ver docs/mcp-apps.md.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createFakeDb } from '../helpers/fake-db';
import { resetQuotaState, resetSubscriptionState } from '../helpers/quota';
import { IDS, seedWorkspace } from '../helpers/assistant';
import { registerTestTools } from '../helpers/test-tools';
import { REEL_ID, STORY_ID, reelRow, storyRow } from '../fixtures/mcp-app-items';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import { POST } from '@/app/api/mcp/route';
import { generateApiKey } from '@/lib/assistant/api-keys';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { defineTool, getTool, registerTools } from '@/lib/assistant/registry';
import { JSONRPC_ERRORS } from '@/lib/assistant/mcp';
import { CONTENT_REVIEW_URI, VIDEO_PLAN_URI } from '@/lib/mcp-app/server';
import { ContentViewSchema, VideoViewSchema } from '@/lib/mcp-app/contract';
import { reportError } from '@/lib/observability';

let secret = '';

function seedKey(over: Record<string, unknown> = {}) {
  const k = generateApiKey();
  secret = k.raw;
  db.seed('kefy_api_keys', [{
    id: IDS.KEY, org_id: IDS.ORG, created_by: IDS.USER, name: 'Claude', key_prefix: k.prefix, key_hash: k.hash,
    scopes: ['read', 'write'], brand_id: null, ...over,
  }]);
}

async function rpc(method: string, params?: unknown) {
  const res = await POST(new NextRequest('http://localhost:3099/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params !== undefined ? { params } : {}) }),
  }));
  return res.json();
}

const call = (name: string, args: Record<string, unknown>) => rpc('tools/call', { name, arguments: args });

// Herramienta de prueba con vista que siempre falla al armarla.
if (!getTool('test_view_fails')) {
  registerTools([defineTool({
    name: 'test_view_fails', kind: 'read', description: 'View always fails.', confirm: 'never',
    input: z.object({}).strict(),
    app: {
      resourceUri: CONTENT_REVIEW_URI,
      view: async () => { throw new Error('boom'); },
    },
    handler: async () => ({ data: { ok: true } }),
  })]);
}

beforeEach(() => {
  db.reset();
  resetQuotaState();
  resetSubscriptionState();
  ensureToolsRegistered();
  registerTestTools();
  seedWorkspace(db);
  seedKey();
  vi.mocked(reportError).mockClear();
});

describe('resources', () => {
  it('resources/list: las dos vistas, con su CSP', async () => {
    const { result } = await rpc('resources/list', {});
    expect(result.resources.map((r: { uri: string }) => r.uri)).toEqual([CONTENT_REVIEW_URI, VIDEO_PLAN_URI]);
    expect(result.resources[0]).toMatchObject({ mimeType: 'text/html;profile=mcp-app', _meta: { ui: { csp: { resourceDomains: expect.any(Array) } } } });
  });

  it('resources/read de una vista devuelve HTML; un uri desconocido es -32002', async () => {
    const { result } = await rpc('resources/read', { uri: VIDEO_PLAN_URI });
    expect(result.contents[0]).toMatchObject({ uri: VIDEO_PLAN_URI, mimeType: 'text/html;profile=mcp-app' });
    expect(result.contents[0].text).toMatch(/<!doctype html>/i);

    const bad = await rpc('resources/read', { uri: 'file:///etc/passwd' });
    expect(bad.error).toMatchObject({ code: JSONRPC_ERRORS.resourceNotFound });
    const missing = await rpc('resources/read', {});
    expect(missing.error).toMatchObject({ code: JSONRPC_ERRORS.invalidParams });
  });

  it('resources/templates/list: vacío', async () => {
    expect((await rpc('resources/templates/list')).result).toEqual({ resourceTemplates: [] });
  });
});

describe('tools/list', () => {
  type ListedTool = { name: string; _meta?: Record<string, unknown>; outputSchema?: Record<string, unknown> };
  const tools = async (): Promise<Map<string, ListedTool>> => {
    const { result } = await rpc('tools/list');
    return new Map(result.tools.map((t: ListedTool) => [t.name, t]));
  };

  it('las que abren vista llevan resourceUri (y la clave antigua) y outputSchema', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read', 'write', 'publish'];
    const list = await tools();
    for (const name of ['create_post', 'create_story', 'create_carousel', 'create_reel', 'get_content', 'review_content']) {
      const t = list.get(name)!;
      expect(t._meta, name).toMatchObject({ ui: { resourceUri: CONTENT_REVIEW_URI, visibility: ['model', 'app'] }, 'ui/resourceUri': CONTENT_REVIEW_URI });
      expect(t.outputSchema, name).toMatchObject({ type: 'object', properties: { view: expect.any(Object) } });
    }
    for (const name of ['get_video_plan', 'produce_video', 'get_video_status']) {
      expect(list.get(name)!._meta, name).toMatchObject({ ui: { resourceUri: VIDEO_PLAN_URI } });
    }
  });

  it('las que la vista llama sin abrir vista: solo visibility model+app', async () => {
    db.rows('kefy_api_keys')[0].scopes = ['read', 'write', 'publish'];
    const list = await tools();
    for (const name of ['update_content', 'generate_content_image', 'convert_content_format', 'prepare_story_video', 'list_social_accounts', 'publish_content']) {
      expect(list.get(name)!._meta, name).toEqual({ ui: { visibility: ['model', 'app'] } });
      expect(list.get(name)!.outputSchema, name).toBeUndefined();
    }
  });

  it('el resto no cambia: sin _meta ni outputSchema', async () => {
    const t = (await tools()).get('list_content')!;
    expect(t._meta).toBeUndefined();
    expect(t.outputSchema).toBeUndefined();
  });
});

describe('tools/call con vista', () => {
  it('get_content: el texto es el de siempre ({data, links}); la vista va solo en structuredContent', async () => {
    db.seed('kefy_content_items', [reelRow()]);
    const { result } = await call('get_content', { brand_id: IDS.BRAND, item_id: REEL_ID });

    expect(result.isError).toBe(false);
    const { view, ...rest } = result.structuredContent;
    // Regresión: el texto es exactamente el JSON de {data, links}, sin la vista.
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe(JSON.stringify(rest));
    expect(result.content[0].text).not.toContain('"view"');
    // El modelo sigue viendo el texto envuelto; la vista, limpio.
    expect(rest.data.item.title).toMatch(/^<untrusted_content/);
    expect(ContentViewSchema.parse(view)).toEqual(view);
    expect(view.items[0].title).not.toContain('untrusted_content');
    expect(view.brand.id).toBe(IDS.BRAND);
  });

  it('la vista de una org con varias marcas lleva el brand_id de la llamada', async () => {
    db.seed('kefy_content_items', [reelRow({ brand_id: IDS.BRAND_2 })]);
    const ok = await call('review_content', { brand_id: IDS.BRAND_2, item_id: REEL_ID });
    expect(ok.result.structuredContent.view.brand).toMatchObject({ id: IDS.BRAND_2, name: 'Acme Bar' });

    // Sin brand_id, la org con dos marcas responde brand_required (la vista nunca lo omite).
    const noBrand = await call('review_content', { item_id: REEL_ID });
    expect(noBrand.result.structuredContent.error.code).toBe('brand_required');
    // Con la otra marca, el ítem no existe.
    const other = await call('review_content', { brand_id: IDS.BRAND, item_id: REEL_ID });
    expect(other.result.structuredContent.error.code).toBe('not_found');
  });

  it('review_content: texto corto para el modelo (no el JSON de la vista)', async () => {
    db.seed('kefy_content_items', [reelRow()]);
    const { result } = await call('review_content', { brand_id: IDS.BRAND, item_id: REEL_ID });
    const data = JSON.parse(result.content[0].text).data;
    expect(data).toEqual({
      item_id: REEL_ID, content_type: 'reel', status: 'draft', title: expect.stringMatching(/^<untrusted_content/),
      has_image: true, has_video: true, slide_count: 5,
    });
    expect(result.content[0].text.length).toBeLessThan(800);
  });

  it('los botones salen de los scopes de la conexión: sin publish no se ofrece publicar', async () => {
    db.seed('kefy_content_items', [reelRow({ status: 'approved' })]);
    const { result } = await call('review_content', { brand_id: IDS.BRAND, item_id: REEL_ID });
    expect(result.structuredContent.view.permissions).toEqual({ write: true, publish: false });
    expect(result.structuredContent.view.items[0].publish_blocked).toBe('no_publish_scope');
  });

  it('get_video_status abre la Vista 2; una story sin guion trae needs_script', async () => {
    db.seed('kefy_content_items', [storyRow()]);
    const { result } = await call('get_video_status', { brand_id: IDS.BRAND, item_id: STORY_ID });
    const view = result.structuredContent.view;
    expect(VideoViewSchema.parse(view)).toEqual(view);
    expect(view).toMatchObject({ kind: 'video', needs_script: true, production: null });
    expect(JSON.parse(result.content[0].text)).toEqual({ data: { item_id: STORY_ID, production: null }, links: expect.any(Array) });
  });

  it('un body con <img onerror> viaja como texto plano en la vista', async () => {
    const evil = '<img src=x onerror="alert(1)">';
    db.seed('kefy_content_items', [storyRow({ body: evil })]);
    const { result } = await call('review_content', { brand_id: IDS.BRAND, item_id: STORY_ID });
    expect(result.structuredContent.view.items[0].body).toBe(evil);
  });

  it('si armar la vista falla, el resultado sale igual (sin vista) y se reporta', async () => {
    const { result } = await call('test_view_fails', { brand_id: IDS.BRAND });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ data: { ok: true } });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: 'mcp:view:test_view_fails' }));
  });

  it('un error de la herramienta no arma vista', async () => {
    const { result } = await call('get_content', { brand_id: IDS.BRAND, item_id: IDS.uuid(999) });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.view).toBeUndefined();
  });
});

describe('fuera de MCP', () => {
  it('review_content solo existe en el servidor MCP', async () => {
    expect(getTool('review_content')!.sources).toEqual(['mcp']);
  });
});
