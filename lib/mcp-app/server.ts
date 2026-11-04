// ─── MCP Apps: recursos ui:// del servidor MCP ───────────────────────────────
//
// El servidor MCP de Kefy (lib/assistant/mcp.ts) no usa el SDK oficial: es un
// despachador JSON-RPC propio, sin estado. Por eso la extensión MCP Apps
// (spec 2026-01-26, @modelcontextprotocol/ext-apps) se implementa aquí a mano,
// con lo mismo que escriben `registerAppTool` / `registerAppResource` del SDK:
//
//   - la herramienta lleva `_meta.ui.resourceUri` (y la clave antigua
//     `_meta["ui/resourceUri"]`, que el SDK sigue escribiendo por compatibilidad);
//   - `resources/read` del `ui://` devuelve el HTML con mimeType
//     `text/html;profile=mcp-app` y la CSP de medios en `_meta.ui.csp`.
//
// Un cliente sin MCP Apps (Claude Code CLI, clientes antiguos) ignora `_meta`
// y sigue viendo el mismo `content[].text` de siempre. Sin estado no se puede
// recordar la capacidad que anunció el cliente en `initialize` (cada POST es
// independiente), así que `_meta.ui` se anuncia siempre: ignorarlo es lo que
// manda la especificación a quien no la implementa.
//
// El HTML es un único bundle (mcp-app/, Vite + vite-plugin-singlefile) que
// sirve a las dos vistas; la vista elige qué pintar por `view.kind`.
// Ver docs/mcp-apps.md.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { reportError } from '@/lib/observability';
import { structuredContentSchema } from '@/lib/mcp-app/contract';

/** Mismos valores que exporta @modelcontextprotocol/ext-apps/server (lo verifica un test). */
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
export const RESOURCE_URI_META_KEY = 'ui/resourceUri';
export const UI_EXTENSION_ID = 'io.modelcontextprotocol/ui';

export const CONTENT_REVIEW_URI = 'ui://kefy/content-review.html';
export const VIDEO_PLAN_URI = 'ui://kefy/video-plan.html';
export type AppResourceUri = typeof CONTENT_REVIEW_URI | typeof VIDEO_PLAN_URI;

export type ToolVisibility = 'model' | 'app';

interface AppResourceDef {
  uri: AppResourceUri;
  name: string;
  title: string;
  description: string;
}

export const APP_RESOURCES: readonly AppResourceDef[] = [
  {
    uri: CONTENT_REVIEW_URI,
    name: 'content-review',
    title: 'Kefy content review',
    description:
      'Interactive card that shows a Kefy content item (post, carousel, reel or story) as it would be published, ' +
      'with controls to approve, edit, regenerate the image, convert, produce the video and publish.',
  },
  {
    uri: VIDEO_PLAN_URI,
    name: 'video-plan',
    title: 'Kefy video plan',
    description:
      'Interactive production plan of a reel or story video: shots, cost per motion level, live progress and the ' +
      'finished video.',
  },
];

export function isAppResourceUri(uri: unknown): uri is AppResourceUri {
  return typeof uri === 'string' && APP_RESOURCES.some((r) => r.uri === uri);
}

// ─── CSP ──────────────────────────────────────────────────────────────────────

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Orígenes de los medios que pinta la vista (img/video). La vista no hace
 * fetch a ninguna API (todo pasa por el host), así que no hay connectDomains.
 *
 * - Storage de Supabase: imágenes, slides, avatar de la marca y videos subidos.
 * - S3 de Remotion Lambda: el mp4 del montaje final (`out.mp4`), con URL
 *   path-style `https://s3.<región>.amazonaws.com/<bucket>/renders/...`.
 * - MCP_APP_MEDIA_DOMAINS: orígenes extra separados por comas (p. ej. si el
 *   storage pasa a un CDN propio).
 */
export function appResourceDomains(env: Record<string, string | undefined> = process.env): string[] {
  const domains = new Set<string>();
  for (const v of [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL]) {
    const o = originOf(v);
    if (o) domains.add(o);
  }
  const region = (env.REMOTION_AWS_REGION || 'us-east-2').trim();
  if (/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) domains.add(`https://s3.${region}.amazonaws.com`);
  for (const extra of (env.MCP_APP_MEDIA_DOMAINS ?? '').split(',')) {
    const o = originOf(extra.trim());
    if (o) domains.add(o);
  }
  return [...domains];
}

export function appResourceMeta(env: Record<string, string | undefined> = process.env) {
  return {
    ui: {
      csp: { resourceDomains: appResourceDomains(env) },
      prefersBorder: true,
    },
  };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

/** Salida de `npm run build:mcp-app`. Viaja con la función por outputFileTracingIncludes. */
export const APP_HTML_PATH = path.join('mcp-app', 'dist', 'kefy-app.html');

let cachedHtml: string | null = null;

/** Página de respaldo si el bundle no está construido: texto, sin scripts. */
const MISSING_BUNDLE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Kefy</title></head>'
  + '<body style="font-family:system-ui,sans-serif;padding:16px">'
  + '<p>The Kefy view is not available right now. Open the content in Kefy instead.</p>'
  + '</body></html>';

export async function readAppHtml(): Promise<string> {
  // En desarrollo se relee siempre: así `npm run build:mcp-app -- --watch` se ve sin reiniciar.
  if (cachedHtml && process.env.NODE_ENV === 'production') return cachedHtml;
  try {
    cachedHtml = await readFile(path.join(process.cwd(), APP_HTML_PATH), 'utf8');
    return cachedHtml;
  } catch (err) {
    reportError(err, { route: 'lib/mcp-app/server', extra: { op: 'readAppHtml', path: APP_HTML_PATH } });
    return MISSING_BUNDLE_HTML;
  }
}

/** Solo para tests. */
export function __resetAppHtmlCacheForTests(): void {
  cachedHtml = null;
}

// ─── Respuestas del protocolo ─────────────────────────────────────────────────

export function listAppResources() {
  const meta = appResourceMeta();
  return APP_RESOURCES.map((r) => ({
    uri: r.uri,
    name: r.name,
    title: r.title,
    description: r.description,
    mimeType: RESOURCE_MIME_TYPE,
    _meta: meta,
  }));
}

export async function readAppResource(uri: AppResourceUri) {
  return {
    contents: [{
      uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: await readAppHtml(),
      _meta: appResourceMeta(),
    }],
  };
}

/**
 * `_meta` de una herramienta en tools/list. Con `resourceUri`, el host monta la
 * vista al llamarla; `visibility` dice quién puede llamarla (el modelo, la
 * vista o ambos; sin ella la especificación asume ambos).
 */
export function toolUiMeta(app: { resourceUri?: AppResourceUri; visibility?: ToolVisibility[] }): Record<string, unknown> {
  const ui: Record<string, unknown> = {};
  if (app.resourceUri) ui.resourceUri = app.resourceUri;
  if (app.visibility) ui.visibility = app.visibility;
  return app.resourceUri ? { ui, [RESOURCE_URI_META_KEY]: app.resourceUri } : { ui };
}

/** Quita `additionalProperties: false` en todo el árbol de un JSON Schema. */
function relax(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relax);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'additionalProperties' && v === false) continue;
    out[k] = relax(v);
  }
  return out;
}

/**
 * `outputSchema` de una herramienta con vista: `{ data, links?, view? }`.
 *
 * Se publica sin `additionalProperties: false`: un host que guarde el
 * tools/list en caché no debe rechazar un resultado porque un despliegue
 * nuevo añadió un campo. La forma exacta la vigilan los tests de contrato.
 */
export function toolOutputSchema(view: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(structuredContentSchema(view), { target: 'draft-7', io: 'output' }) as Record<string, unknown>;
  delete s.$schema;
  return relax(s) as Record<string, unknown>;
}
