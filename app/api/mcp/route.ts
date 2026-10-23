import { NextRequest, NextResponse } from 'next/server';
import { appUrl } from '@/lib/app-url';
import { reportError } from '@/lib/observability';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import { apiLanguage, apiToolContext, authenticateApiKey } from '@/lib/assistant/api-keys';
import { resourceMetadataUrl } from '@/lib/assistant/oauth';
import {
  handleMcpMessage, isSupportedProtocolVersion, jsonRpcError, JSONRPC_ERRORS,
} from '@/lib/assistant/mcp';

// ─── /api/mcp ────────────────────────────────────────────────────────────────
// Servidor MCP (Streamable HTTP, sin estado, solo respuestas JSON).
//
// Se autentica con `Authorization: Bearer kefy_sk_…` (lib/assistant/api-keys.ts)
// o con el access token de una conexión OAuth (lib/assistant/oauth.ts); no
// acepta la cookie de sesión y por eso está en PUBLIC_API_PATHS de proxy.ts.
// Un mensaje JSON-RPC por POST: los lotes (arrays) se rechazan. No hay stream
// SSE del servidor, así que GET y DELETE responden 405.
//
// Ver docs/assistant.md.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * Protección contra DNS rebinding (la exige la especificación): si el
 * navegador manda Origin, tiene que ser el de la propia app. Los clientes MCP
 * de escritorio y de terminal no mandan Origin.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}

/**
 * Cabecera del 401. `resource_metadata` es lo que permite a un cliente MCP
 * (los conectores de claude.ai) descubrir el OAuth de Kefy en vez de pedir
 * una key a mano. Sin credenciales no va `error` (RFC 6750 §3.1).
 */
function wwwAuthenticate(req: NextRequest): string {
  const params = [`realm="kefy"`];
  if (req.headers.get('authorization')) params.push('error="invalid_token"');
  params.push(`resource_metadata="${resourceMetadataUrl(req.nextUrl.origin)}"`);
  return `Bearer ${params.join(', ')}`;
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get('origin'))) {
    return json({ error: 'Forbidden origin' }, 403);
  }

  // Sin cabecera se asume 2025-03-26 (lo dice la especificación); una versión
  // que no hablamos es un 400.
  const protocolHeader = req.headers.get('mcp-protocol-version');
  if (protocolHeader !== null && !isSupportedProtocolVersion(protocolHeader)) {
    return json({ error: 'Unsupported MCP-Protocol-Version' }, 400);
  }

  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    const headers: Record<string, string> = { ...(auth.headers ?? {}) };
    if (auth.status === 401) headers['WWW-Authenticate'] = wwwAuthenticate(req);
    return json(auth.body, auth.status, headers);
  }

  ensureToolsRegistered();
  const ctx = apiToolContext(auth.value, 'mcp', apiLanguage(req));

  let payload: unknown;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(jsonRpcError(null, JSONRPC_ERRORS.parseError, 'Parse error'));
  }

  if (Array.isArray(payload)) {
    return json(jsonRpcError(null, JSONRPC_ERRORS.invalidRequest, 'Batch requests are not supported'));
  }

  let out: object | null;
  try {
    out = await handleMcpMessage(payload, ctx);
  } catch (err) {
    // executeTool ya convierte los fallos de las herramientas en isError; aquí
    // solo llega un fallo nuestro del despachador.
    reportError(err, { route: 'POST /api/mcp', auth: ctx.auth, extra: { apiKeyId: ctx.apiKeyId } });
    const id = typeof payload === 'object' && payload !== null && 'id' in payload
      ? (payload as { id?: unknown }).id
      : null;
    const safeId = typeof id === 'string' || typeof id === 'number' ? id : null;
    return json(jsonRpcError(safeId, JSONRPC_ERRORS.internalError, 'Internal error'));
  }

  // Notificación o respuesta del cliente: 202 sin cuerpo.
  if (out === null) return new NextResponse(null, { status: 202, headers: NO_STORE });
  return json(out);
}

function methodNotAllowed(): NextResponse {
  return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
