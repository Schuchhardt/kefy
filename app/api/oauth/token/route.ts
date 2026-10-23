import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_CORS_HEADERS, exchangeAuthorizationCode, refreshAccessToken,
} from '@/lib/assistant/oauth';
import { checkRateLimit, clientIp, oauthTokenRule, rateLimitBody, rateLimitHeaders } from '@/lib/rate-limit';

// ─── POST /api/oauth/token ───────────────────────────────────────────────────
// Token endpoint (OAuth 2.1): `authorization_code` con PKCE y `refresh_token`.
// Público (PUBLIC_API_PATHS de proxy.ts): lo que autentica es el código o el
// refresh token, no una cookie. Acepta form-urlencoded (lo estándar) y JSON.
// Ver lib/assistant/oauth.ts.

const HEADERS = { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' };

function error(status: number, code: string, description: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: code, error_description: description }, {
    status, headers: { ...HEADERS, ...extra },
  });
}

async function readParams(req: NextRequest): Promise<URLSearchParams | null> {
  const type = req.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = await req.json() as unknown;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') params.set(k, v);
      }
      return params;
    }
    return new URLSearchParams(await req.text());
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(oauthTokenRule(clientIp(req)));
  if (!rl.allowed) {
    const body = rateLimitBody(rl, 'Too many token requests');
    return error(429, 'slow_down', body.error, rateLimitHeaders(rl));
  }

  const params = await readParams(req);
  if (!params) return error(400, 'invalid_request', 'Body must be form-urlencoded or JSON');

  const grantType = params.get('grant_type');
  const result =
    grantType === 'authorization_code' ? await exchangeAuthorizationCode(params, req.nextUrl.origin)
    : grantType === 'refresh_token' ? await refreshAccessToken(params)
    : null;
  if (!result) return error(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');

  if (!result.ok) return NextResponse.json(result.error, { status: result.status, headers: HEADERS });
  return NextResponse.json(result.body, { headers: HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
