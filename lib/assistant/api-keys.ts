// ─── API keys de organización (MCP y /api/v1) ────────────────────────────────
//
// Formato: `kefy_sk_` + 43 caracteres base64url (32 bytes aleatorios). Solo se
// guarda el hash sha256 (hashToken, igual que invitaciones y refresh tokens) y
// los 12 primeros caracteres para reconocerla en la UI; el valor en claro se
// muestra una única vez al crearla.
//
// Una key NO tiene rol propio: actúa con el rol ACTUAL de quien la creó, que se
// resuelve en cada petición contra kefy_org_memberships. Si esa persona sale
// de la organización, la key deja de funcionar. El plan sale de
// kefy_organizations, no de un JWT que podría estar desfasado.
//
// Nunca se loguea ni se reporta el token: en Sentry solo van keyId y keyPrefix.

import { randomBytes } from 'node:crypto';
import { hashToken } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase';
import { getActiveBrandById } from '@/lib/brands';
import { apiKeyRule, checkRateLimit, rateLimitBody, rateLimitHeaders } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import type { OrgRole } from '@/lib/team';
import type { JWTPayload } from '@/types/auth';
import type { Scope, ToolContext } from '@/lib/assistant/types';

export const API_KEY_PREFIX = 'kefy_sk_';
export const API_KEY_RE = /^kefy_sk_[A-Za-z0-9_-]{43}$/;
export const API_KEY_SCOPES: readonly Scope[] = ['read', 'write', 'publish'];
/** Keys activas (no revocadas ni caducadas) por organización. */
export const MAX_ACTIVE_API_KEYS = 10;

/** Cada cuánto, como mucho, se actualiza last_used_at de una key. */
const LAST_USED_THROTTLE_MS = 60_000;

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = API_KEY_PREFIX + randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export interface ApiKeyAuth {
  key: {
    id: string;
    org_id: string;
    brand_id: string | null;
    scopes: Scope[];
    key_prefix: string;
  };
  /** Sesión equivalente: la de quien creó la key, con su rol actual. */
  auth: JWTPayload;
  role: OrgRole;
  plan: string;
  /** Nombre de la organización (para /api/v1/me). */
  orgName: string | null;
}

export type ApiKeyAuthResult =
  | { ok: true; value: ApiKeyAuth }
  | { ok: false; status: 401 | 429 | 503; body: Record<string, unknown>; headers?: Record<string, string> };

interface ApiKeyRow {
  id: string;
  org_id: string;
  brand_id: string | null;
  created_by: string | null;
  scopes: string[] | null;
  key_prefix: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

const unauthorized = (error: string): ApiKeyAuthResult => ({ ok: false, status: 401, body: { error } });

const UNAVAILABLE: ApiKeyAuthResult = {
  ok: false,
  status: 503,
  body: { error: 'Could not verify the API key. Try again in a moment.' },
};

function isScope(s: string): s is Scope {
  return (API_KEY_SCOPES as readonly string[]).includes(s);
}

function isRole(r: unknown): r is OrgRole {
  return r === 'owner' || r === 'admin' || r === 'member';
}

/**
 * Autentica una petición con `Authorization: Bearer kefy_sk_…`.
 *
 * Orden: formato → key (por hash) → membresía y plan del creador → marca
 * atada → rate limit de la key → last_used_at (sin bloquear).
 */
export async function authenticateApiKey(req: Request, now = new Date()): Promise<ApiKeyAuthResult> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header.trim());
  const token = match?.[1];
  if (!token || !API_KEY_RE.test(token)) return unauthorized('Missing or malformed API key');

  const db = createSupabaseServer();

  // 1. La key, buscada por hash: el secreto nunca se compara como texto.
  let key: ApiKeyRow | null;
  try {
    const { data, error } = await db
      .from('kefy_api_keys')
      .select('id, org_id, brand_id, created_by, scopes, key_prefix, expires_at, revoked_at, last_used_at')
      .eq('key_hash', hashToken(token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    key = (data as ApiKeyRow | null) ?? null;
  } catch (err) {
    reportError(err, { route: 'api-key', service: 'supabase', extra: { step: 'lookup' } });
    return UNAVAILABLE;
  }

  if (
    !key
    || key.revoked_at
    || (key.expires_at && new Date(key.expires_at).getTime() <= now.getTime())
    || !key.created_by
  ) {
    return unauthorized('Invalid API key');
  }

  const logExtra = { keyId: key.id, keyPrefix: key.key_prefix };
  const createdBy = key.created_by;

  // 2. Rol actual del creador y plan de la organización.
  let role: OrgRole;
  let plan: string;
  let orgName: string | null;
  try {
    const { data, error } = await db
      .from('kefy_org_memberships')
      .select('role, kefy_organizations(name, plan)')
      .eq('user_id', createdBy)
      .eq('org_id', key.org_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !isRole((data as { role?: unknown }).role)) {
      return unauthorized('The user who created this key is no longer a member');
    }
    role = (data as { role: OrgRole }).role;
    const org = (data as { kefy_organizations?: unknown }).kefy_organizations as
      { name?: string | null; plan?: string | null } | null;
    plan = org?.plan ?? 'starter';
    orgName = org?.name ?? null;
  } catch (err) {
    reportError(err, { route: 'api-key', service: 'supabase', extra: { ...logExtra, step: 'membership' } });
    return UNAVAILABLE;
  }

  // 3. Marca atada: tiene que seguir existiendo y no estar archivada.
  if (key.brand_id) {
    try {
      const brand = await getActiveBrandById(key.brand_id, key.org_id);
      if (!brand) return unauthorized('The brand bound to this key is archived or deleted');
    } catch (err) {
      reportError(err, { route: 'api-key', service: 'supabase', extra: { ...logExtra, step: 'brand' } });
      return UNAVAILABLE;
    }
  }

  // 4. Rate limit propio de la key (MCP y REST comparten el bucket).
  const rl = await checkRateLimit(apiKeyRule(key.id), now.getTime());
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      body: rateLimitBody(rl, 'Too many requests for this API key'),
      headers: rateLimitHeaders(rl),
    };
  }

  // 5. last_used_at, como mucho una vez por minuto y sin esperar la escritura.
  const lastUsed = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (now.getTime() - lastUsed > LAST_USED_THROTTLE_MS) {
    void Promise.resolve(
      db.from('kefy_api_keys').update({ last_used_at: now.toISOString() }).eq('id', key.id),
    )
      .then(({ error }) => {
        if (error) throw new Error(error.message);
      })
      .catch((err: unknown) => {
        reportError(err, { route: 'api-key', service: 'supabase', extra: logExtra });
      });
  }

  const scopes = (key.scopes ?? []).filter(isScope);
  const auth: JWTPayload = {
    userId: createdBy,
    orgId: key.org_id,
    role,
    plan: plan as JWTPayload['plan'],
  };

  return {
    ok: true,
    value: {
      key: {
        id: key.id,
        org_id: key.org_id,
        brand_id: key.brand_id,
        scopes,
        key_prefix: key.key_prefix,
      },
      auth,
      role,
      plan,
      orgName,
    },
  };
}

/** Idioma de los mensajes para un cliente externo: inglés salvo `Accept-Language: es…`. */
export function apiLanguage(req: Request): 'es' | 'en' {
  const al = req.headers.get('accept-language')?.trim().toLowerCase() ?? '';
  return al.startsWith('es') ? 'es' : 'en';
}

/**
 * ToolContext de una llamada externa. Sin marca atada, `brandId` va vacío y
 * executeTool la resuelve con el `brand_id` del input (o la única marca).
 */
export function apiToolContext(
  a: ApiKeyAuth,
  source: 'api' | 'mcp',
  language: 'es' | 'en' = 'en',
): ToolContext {
  return {
    auth: a.auth,
    brandId: a.key.brand_id ?? '',
    boundBrandId: a.key.brand_id,
    language,
    brandScope: 'strict',
    orgId: a.auth.orgId,
    userId: a.auth.userId,
    role: a.role,
    plan: a.plan,
    source,
    scopes: a.key.scopes,
    apiKeyId: a.key.id,
  };
}
