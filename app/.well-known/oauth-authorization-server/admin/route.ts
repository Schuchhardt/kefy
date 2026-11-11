import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS, authorizationServerMetadata } from '@/lib/assistant/oauth';

// ─── /.well-known/oauth-authorization-server/admin ──────────────────────────
// Metadatos del emisor `<origen>/admin` (RFC 8414 §3.1, con ruta): el del MCP
// de administración. Mismo token y registro que el normal, pero su
// authorization_endpoint ya pide `resource=/api/admin/mcp`, así la conexión es
// la de admin aunque el cliente no mande `resource`. Ver docs/admin-mcp.md.

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(req.nextUrl.origin, { admin: true }), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
