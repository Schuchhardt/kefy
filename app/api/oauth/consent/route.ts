import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { canManageTeam } from '@/lib/team';
import { getActiveBrandById, listActiveBrands } from '@/lib/brands';
import { requireActiveSubscription } from '@/lib/subscription';
import { ADMIN_SCOPE, API_KEY_SCOPES } from '@/lib/assistant/api-keys';
import {
  DEFAULT_OAUTH_SCOPES, isAdminResource, issueAuthorizationCode, validateAuthorizeRequest, withParams,
  type AuthorizeValidation,
} from '@/lib/assistant/oauth';
import { isPlatformAdminEmail, userEmail } from '@/lib/admin/auth';
import type { Scope } from '@/lib/assistant/types';

// ─── /api/oauth/consent ──────────────────────────────────────────────────────
// La pantalla /{lang}/oauth/authorize (components/auth/OAuthConsentView.tsx)
// habla con esta ruta, con la cookie de sesión (no está en PUBLIC_API_PATHS):
//
//   GET  ?<parámetros de /oauth/authorize>  → qué cliente pide acceso y a qué
//   POST { query, decision, scopes, brand_id, lang } → URL de vuelta al cliente
//
// Autorizar emite una conexión que actúa como una API key, así que exige lo
// mismo que crearla en Ajustes: dueño o administrador y suscripción activa.
// Ver lib/assistant/oauth.ts y docs/assistant.md §7.
//
// Si el `resource` es el MCP de administración (/api/admin/mcp), la conexión
// lleva solo el scope 'admin', sin marca, y solo se emite a quien está en
// KEFY_ADMIN_EMAILS (docs/admin-mcp.md). No depende del rol en su equipo ni
// de la suscripción de su organización.

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Respuesta para una petición de autorización que no es válida. */
function invalid(v: Exclude<AuthorizeValidation, { ok: true }>) {
  if (v.kind === 'unavailable') return json({ code: 'unavailable' }, 503);
  if (v.kind === 'fatal') return json({ code: v.error.error, error: v.error.error_description }, 400);
  // El cliente es de fiar: el error vuelve a él por su redirect_uri.
  return json({ code: v.error.error, redirect: v.redirect });
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return json({ code: 'unauthorized' }, 401);

  const v = await validateAuthorizeRequest(req.nextUrl.searchParams, req.nextUrl.origin);
  if (!v.ok) return invalid(v);

  const db = createSupabaseServer();
  const [{ data: org }, { data: user }, brands] = await Promise.all([
    db.from('kefy_organizations').select('name').eq('id', auth.orgId).maybeSingle(),
    db.from('kefy_users').select('email').eq('id', auth.userId).maybeSingle(),
    listActiveBrands(auth.orgId),
  ]);

  const email = (user?.email as string | undefined) ?? null;
  const admin = isAdminResource(v.request.resource, req.nextUrl.origin);

  return json({
    client: { name: v.request.clientName, redirect_host: new URL(v.request.redirectUri).host },
    org_name: (org?.name as string | undefined) ?? null,
    user_email: email,
    admin,
    brands: admin ? [] : brands.map((b) => ({ id: b.id, name: b.name })),
    can_authorize: admin ? isPlatformAdminEmail(email) : canManageTeam(auth.role),
    default_scopes: admin ? [] : DEFAULT_OAUTH_SCOPES,
  });
}

// ─── POST ────────────────────────────────────────────────────────────────────

const decisionSchema = z.object({
  /** La query de /oauth/authorize tal cual (sin `?`). */
  query: z.string().max(4000),
  decision: z.enum(['approve', 'deny']),
  scopes: z
    .array(z.enum(API_KEY_SCOPES as [Scope, ...Scope[]]))
    .transform((s) => API_KEY_SCOPES.filter((x) => s.includes(x)))
    .optional(),
  brand_id: z.uuid().nullable().optional(),
  lang: z.enum(['es', 'en']).optional(),
});

export async function POST(req: NextRequest) {
  // La decisión solo puede salir de la propia pantalla de Kefy.
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return json({ code: 'forbidden' }, 403);

  const auth = await getAuthFromRequest(req);
  if (!auth) return json({ code: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return json({ code: 'invalid_body' }, 400);
  }
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return json({ code: 'invalid_body' }, 422);
  const input = parsed.data;

  const v = await validateAuthorizeRequest(new URLSearchParams(input.query), req.nextUrl.origin);
  if (!v.ok) return invalid(v);
  const request = v.request;

  if (input.decision === 'deny') {
    return json({
      redirect: withParams(request.redirectUri, {
        error: 'access_denied', state: request.state, iss: req.nextUrl.origin,
      }),
    });
  }

  if (isAdminResource(request.resource, req.nextUrl.origin)) {
    let email: string | null = null;
    try { email = await userEmail(auth.userId); } catch { return json({ code: 'unavailable' }, 503); }
    if (!isPlatformAdminEmail(email)) return json({ code: 'admin_forbidden' }, 403);
    const redirect = await issueAuthorizationCode(
      request,
      { orgId: auth.orgId, userId: auth.userId, brandId: null, scopes: [ADMIN_SCOPE] },
      req.nextUrl.origin,
    );
    if (!redirect) return json({ code: 'unavailable' }, 503);
    return json({ redirect });
  }

  if (!canManageTeam(auth.role)) return json({ code: 'forbidden' }, 403);
  const scopes = input.scopes ?? [];
  if (scopes.length === 0) return json({ code: 'scopes_required' }, 422);

  const brandId = input.brand_id ?? null;
  if (brandId && !(await getActiveBrandById(brandId, auth.orgId))) {
    return json({ code: 'brand_not_found' }, 404);
  }

  // Igual que al crear una API key: sin suscripción activa no se emite acceso.
  const blocked = await requireActiveSubscription(auth.orgId, input.lang ?? 'es');
  if (blocked) return blocked;

  const redirect = await issueAuthorizationCode(
    request,
    { orgId: auth.orgId, userId: auth.userId, brandId, scopes },
    req.nextUrl.origin,
  );
  // issueAuthorizationCode ya reportó el fallo a Sentry.
  if (!redirect) return json({ code: 'unavailable' }, 503);
  return json({ redirect });
}
