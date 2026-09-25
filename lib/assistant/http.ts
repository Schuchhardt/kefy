// ─── Utilidades HTTP de la API pública (/api/v1) ─────────────────────────────
//
// Todas las rutas /api/v1 pasan por withApiKey: autentica la API key, arma el
// ToolContext y garantiza un formato de error único para los clientes:
//
//   { ok: false, error: { code, message }, ...detalles }
//
// donde los detalles son el resto del cuerpo del error (issues de validación,
// la lista de marcas en brand_required, subscriptionRequired, retryAfter…).
// Ninguna respuesta se cachea.

import { NextResponse, type NextRequest } from 'next/server';
import { reportError } from '@/lib/observability';
import { absoluteUrl } from '@/lib/app-url';
import { ServiceError } from '@/lib/services/errors';
import { ensureToolsRegistered } from '@/lib/assistant/tools';
import {
  apiLanguage, apiToolContext, authenticateApiKey, type ApiKeyAuth,
} from '@/lib/assistant/api-keys';
import type { ToolContext, ToolErrorBody, ToolLink } from '@/lib/assistant/types';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** El cuerpo de error de la API: el objeto `error` nunca lo pisa un `error: string` del detalle. */
export function apiErrorBody(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(details ?? {}) };
  delete rest.error;
  return { ok: false, error: { code, message }, ...rest };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(apiErrorBody(code, message, details), {
    status,
    headers: { ...NO_STORE, ...(headers ?? {}) },
  });
}

/** Resultado fallido de executeTool → respuesta HTTP con su estado y cabeceras (Retry-After). */
export function toolErrorResponse(error: ToolErrorBody, headers?: Record<string, string>): NextResponse {
  return apiError(error.code, error.message, error.status, error.body, { ...(error.headers ?? {}), ...(headers ?? {}) });
}

/**
 * Los enlaces de las herramientas son rutas del dashboard ('/es/dashboard/…').
 * Fuera del navegador no sirven relativas: se devuelven absolutas.
 */
export function absoluteLinks(links: ToolLink[] | undefined): ToolLink[] | undefined {
  if (!links) return undefined;
  return links.map((l) => ({ ...l, href: l.href.startsWith('/') ? absoluteUrl(l.href) : l.href }));
}

function authFailureCode(status: number): string {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}

/**
 * Envoltorio de las rutas /api/v1: autentica la key y ejecuta `fn` con el
 * ToolContext (fuente 'api'). Un 401 lleva `WWW-Authenticate`; un 429, las
 * cabeceras del rate limit. Todo sale con Cache-Control: no-store.
 */
export async function withApiKey(
  req: NextRequest,
  route: string,
  fn: (ctx: ToolContext, a: ApiKeyAuth) => Promise<NextResponse>,
): Promise<NextResponse> {
  ensureToolsRegistered();

  const r = await authenticateApiKey(req);
  if (!r.ok) {
    const headers: Record<string, string> = { ...(r.headers ?? {}) };
    if (r.status === 401) headers['WWW-Authenticate'] = 'Bearer realm="kefy"';
    return apiError(authFailureCode(r.status), String(r.body.error), r.status, r.body, headers);
  }

  const ctx = apiToolContext(r.value, 'api', apiLanguage(req));

  let res: NextResponse;
  try {
    res = await fn(ctx, r.value);
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.status >= 500 && !err.reported) {
        reportError(err, { route, auth: ctx.auth, extra: { code: err.code, apiKeyId: ctx.apiKeyId } });
      }
      return apiError(err.code, err.message, err.status, err.body, err.headers);
    }
    reportError(err, { route, auth: ctx.auth, extra: { apiKeyId: ctx.apiKeyId } });
    return apiError('internal_error', 'Internal error', 500);
  }

  res.headers.set('Cache-Control', 'no-store');
  return res;
}
