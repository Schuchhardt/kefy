import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS, protectedResourceMetadata } from '@/lib/assistant/oauth';

// ─── /.well-known/oauth-protected-resource ───────────────────────────────────
// Metadatos del recurso protegido (RFC 9728): le dicen a un cliente MCP qué
// servidor de autorización emite tokens para /api/mcp. También se sirven en
// /.well-known/oauth-protected-resource/api/mcp, que es la URL que anuncia el
// 401 de /api/mcp. Ver lib/assistant/oauth.ts.

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req.nextUrl.origin), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
