import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_MCP_PATH, OAUTH_CORS_HEADERS, protectedResourceMetadata } from '@/lib/assistant/oauth';

// Metadatos del recurso protegido del MCP de administración (RFC 9728 §3.1):
// es la URL que anuncia el 401 de /api/admin/mcp. Mismo servidor de
// autorización que /api/mcp, pero el recurso y el scope son los de admin.
// Ver docs/admin-mcp.md.

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req.nextUrl.origin, ADMIN_MCP_PATH), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
