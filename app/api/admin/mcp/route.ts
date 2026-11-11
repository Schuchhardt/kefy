import { NextRequest, NextResponse } from 'next/server';
import { appUrl } from '@/lib/app-url';
import { reportError } from '@/lib/observability';
import { authenticateAdmin } from '@/lib/admin/auth';
import { handleAdminMcpMessage } from '@/lib/admin/mcp';
import { ensureAdminToolsRegistered } from '@/lib/admin/tools';
import { isSupportedProtocolVersion, jsonRpcError, JSONRPC_ERRORS } from '@/lib/assistant/mcp';
import { ADMIN_MCP_PATH, resourceMetadataUrl } from '@/lib/assistant/oauth';

// ─── /api/admin/mcp ──────────────────────────────────────────────────────────
// MCP de administración de la plataforma (docs/admin-mcp.md). Mismo
// transporte que /api/mcp. Se autentica con una conexión OAuth de scope
// 'admin' cuyo dueño esté en KEFY_ADMIN_EMAILS (lib/admin/auth.ts); no acepta
// la cookie de sesión y por eso está en PUBLIC_API_PATHS de proxy.ts.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}

function wwwAuthenticate(req: NextRequest, status: 401 | 403): string {
  const params = [`realm="kefy-admin"`];
  if (status === 403) params.push('error="insufficient_scope"', 'scope="admin"');
  else { params.push('scope="admin"'); if (req.headers.get('authorization')) params.push('error="invalid_token"'); }
  params.push(`resource_metadata="${resourceMetadataUrl(req.nextUrl.origin, ADMIN_MCP_PATH)}"`);
  return `Bearer ${params.join(', ')}`;
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req.headers.get('origin'))) return json({ error: 'Forbidden origin' }, 403);

  const protocolHeader = req.headers.get('mcp-protocol-version');
  if (protocolHeader !== null && !isSupportedProtocolVersion(protocolHeader)) {
    return json({ error: 'Unsupported MCP-Protocol-Version' }, 400);
  }

  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    const headers: Record<string, string> = { ...(auth.headers ?? {}) };
    if (auth.status === 401 || auth.status === 403) headers['WWW-Authenticate'] = wwwAuthenticate(req, auth.status);
    if (req.headers.get('authorization')) console.info(`[admin-mcp] ${auth.status} auth`);
    return json(auth.body, auth.status, headers);
  }

  ensureAdminToolsRegistered();

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
    out = await handleAdminMcpMessage(payload, auth.ctx);
  } catch (err) {
    reportError(err, { route: 'POST /api/admin/mcp', extra: { adminUserId: auth.ctx.adminUserId } });
    const id = typeof payload === 'object' && payload !== null && 'id' in payload ? (payload as { id?: unknown }).id : null;
    return json(jsonRpcError(typeof id === 'string' || typeof id === 'number' ? id : null, JSONRPC_ERRORS.internalError, 'Internal error'));
  }
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
