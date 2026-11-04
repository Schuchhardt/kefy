// Recursos ui:// de MCP Apps (lib/mcp-app/server.ts): lo que el servidor
// escribe a mano tiene que coincidir con lo que escribiría el SDK oficial.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import {
  RESOURCE_MIME_TYPE as SDK_MIME, RESOURCE_URI_META_KEY as SDK_URI_KEY, EXTENSION_ID as SDK_EXTENSION,
} from '@modelcontextprotocol/ext-apps/server';
import {
  APP_HTML_PATH, APP_RESOURCES, CONTENT_REVIEW_URI, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY, UI_EXTENSION_ID,
  VIDEO_PLAN_URI, __resetAppHtmlCacheForTests, appResourceDomains, isAppResourceUri, listAppResources,
  readAppResource, toolOutputSchema, toolUiMeta,
} from '@/lib/mcp-app/server';
import { ContentViewSchema } from '@/lib/mcp-app/contract';

describe('constantes del SDK', () => {
  it('mimeType, clave antigua y id de la extensión son los de @modelcontextprotocol/ext-apps', () => {
    expect(RESOURCE_MIME_TYPE).toBe(SDK_MIME);
    expect(RESOURCE_URI_META_KEY).toBe(SDK_URI_KEY);
    expect(UI_EXTENSION_ID).toBe(SDK_EXTENSION);
  });
});

describe('CSP de medios', () => {
  it('Supabase, el S3 de Remotion de la región y los extra; nada que no sea https', () => {
    expect(appResourceDomains({
      SUPABASE_URL: 'https://abc.supabase.co',
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/',
      REMOTION_AWS_REGION: 'us-east-2',
      MCP_APP_MEDIA_DOMAINS: 'https://cdn.kefy.app/x, http://inseguro.com, nope',
    })).toEqual([
      'https://abc.supabase.co', 'https://s3.us-east-2.amazonaws.com', 'https://cdn.kefy.app',
    ]);
  });

  it('sin región usa us-east-2 (la de producción); una región rara no entra', () => {
    expect(appResourceDomains({})).toEqual(['https://s3.us-east-2.amazonaws.com']);
    expect(appResourceDomains({ REMOTION_AWS_REGION: 'evil.com/x' })).toEqual([]);
  });

  it('sin connectDomains: la vista no hace fetch a ninguna API', () => {
    const [entry] = listAppResources();
    expect(entry._meta.ui.csp).not.toHaveProperty('connectDomains');
  });
});

describe('recursos', () => {
  it('dos vistas ui:// con el mimeType de MCP Apps', () => {
    const list = listAppResources();
    expect(list.map((r) => r.uri)).toEqual([CONTENT_REVIEW_URI, VIDEO_PLAN_URI]);
    for (const r of list) expect(r.mimeType).toBe('text/html;profile=mcp-app');
    expect(isAppResourceUri(CONTENT_REVIEW_URI)).toBe(true);
    expect(isAppResourceUri('ui://kefy/otra.html')).toBe(false);
    expect(APP_RESOURCES).toHaveLength(2);
  });

  describe('HTML', () => {
    let dir = '';
    beforeEach(() => {
      __resetAppHtmlCacheForTests();
      dir = mkdtempSync(path.join(tmpdir(), 'kefy-mcp-app-'));
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
    });
    afterEach(() => {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    });

    it('sirve el bundle construido, con la CSP en _meta.ui', async () => {
      mkdirSync(path.join(dir, path.dirname(APP_HTML_PATH)), { recursive: true });
      writeFileSync(path.join(dir, APP_HTML_PATH), '<!doctype html><title>Kefy</title>');
      const { contents } = await readAppResource(CONTENT_REVIEW_URI);
      expect(contents[0]).toMatchObject({ uri: CONTENT_REVIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: '<!doctype html><title>Kefy</title>' });
      expect(contents[0]._meta.ui.csp.resourceDomains.length).toBeGreaterThan(0);
    });

    it('sin bundle devuelve una página de texto sin scripts (y lo reporta)', async () => {
      const { contents } = await readAppResource(VIDEO_PLAN_URI);
      expect(contents[0].text).toContain('<!doctype html>');
      expect(contents[0].text).not.toContain('<script');
    });
  });
});

describe('metadatos de herramientas', () => {
  it('con vista: _meta.ui.resourceUri + la clave antigua, como registerAppTool', () => {
    expect(toolUiMeta({ resourceUri: CONTENT_REVIEW_URI, visibility: ['model', 'app'] })).toEqual({
      ui: { resourceUri: CONTENT_REVIEW_URI, visibility: ['model', 'app'] },
      'ui/resourceUri': CONTENT_REVIEW_URI,
    });
  });

  it('sin vista: solo visibility (la vista puede llamarla)', () => {
    expect(toolUiMeta({ visibility: ['model', 'app'] })).toEqual({ ui: { visibility: ['model', 'app'] } });
  });

  it('outputSchema: { data, links?, view? } sin additionalProperties:false en ningún nivel', () => {
    const s = toolOutputSchema(ContentViewSchema);
    expect(s.type).toBe('object');
    expect(Object.keys(s.properties as object)).toEqual(['data', 'links', 'view']);
    expect(JSON.stringify(s)).not.toContain('"additionalProperties":false');
    expect(s).not.toHaveProperty('$schema');
  });
});
