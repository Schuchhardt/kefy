import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS, authorizationServerMetadata } from '@/lib/assistant/oauth';

// ─── /.well-known/oauth-authorization-server ─────────────────────────────────
// Metadatos del servidor de autorización (RFC 8414): endpoints de autorización,
// token y registro dinámico, PKCE S256 y clientes públicos. Ver
// lib/assistant/oauth.ts.

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(req.nextUrl.origin), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
