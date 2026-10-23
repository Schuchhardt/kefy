import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS, registerClient } from '@/lib/assistant/oauth';
import { checkRateLimit, clientIp, oauthRegisterRule, rateLimitBody, rateLimitHeaders } from '@/lib/rate-limit';

// ─── POST /api/oauth/register ────────────────────────────────────────────────
// Registro dinámico de clientes (RFC 7591). Público (está en PUBLIC_API_PATHS
// de proxy.ts): registrarse no da acceso a nada, solo permite pedir a una
// persona que autorice. Solo clientes públicos con PKCE. Ver
// lib/assistant/oauth.ts.

const HEADERS = { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(oauthRegisterRule(clientIp(req)));
  if (!rl.allowed) {
    return NextResponse.json(rateLimitBody(rl, 'Too many client registrations'), {
      status: 429, headers: { ...HEADERS, ...rateLimitHeaders(rl) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Body must be JSON' },
      { status: 400, headers: HEADERS },
    );
  }

  const result = await registerClient(body);
  if (!result.ok) return NextResponse.json(result.error, { status: result.status, headers: HEADERS });
  return NextResponse.json(result.client, { status: 201, headers: HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
