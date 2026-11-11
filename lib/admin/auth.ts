// ─── Quién es administrador de la plataforma ─────────────────────────────────
//
// El MCP de administración (/api/admin/mcp) ve TODAS las organizaciones. Para
// entrar hacen falta las dos cosas, en cada petición:
//
//   1. Un access token OAuth con el scope 'admin' (solo lo emite el
//      consentimiento cuando el recurso es /api/admin/mcp; ver
//      lib/assistant/oauth.ts y app/api/oauth/consent/route.ts).
//   2. Que el email de quien autorizó siga en KEFY_ADMIN_EMAILS.
//
// Quitar un email de la variable corta el acceso en la siguiente petición,
// aunque su conexión siga viva. Sin la variable, nadie es admin.
//
// Ver docs/admin-mcp.md.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { authenticateApiKey, type ApiKeyAuthResult } from '@/lib/assistant/api-keys';
import type { AdminContext } from '@/lib/services/admin/context';

/** Emails de KEFY_ADMIN_EMAILS (separados por comas o espacios), en minúsculas. */
export function adminEmails(env: string | undefined = process.env.KEFY_ADMIN_EMAILS): Set<string> {
  return new Set(
    (env ?? '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}

/** Email de un usuario, o null si no existe. Lanza si la base falla. */
export async function userEmail(userId: string): Promise<string | null> {
  const { data, error } = await createSupabaseServer()
    .from('kefy_users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.email as string | undefined) ?? null;
}

export type AdminAuthResult =
  | { ok: true; ctx: AdminContext }
  | Extract<ApiKeyAuthResult, { ok: false }>
  | { ok: false; status: 403; body: Record<string, unknown>; headers?: Record<string, string> };

/**
 * Autentica una petición al MCP de administración. 401 sin token válido (el
 * cliente redescubre el OAuth), 403 si el token es válido pero no es de admin.
 */
export async function authenticateAdmin(req: Request, now = new Date()): Promise<AdminAuthResult> {
  const auth = await authenticateApiKey(req, now);
  if (!auth.ok) return auth;

  // Una key normal o una conexión al MCP de la organización no entra aquí.
  if (!auth.value.key.admin) {
    return { ok: false, status: 403, body: { error: 'This token is not an admin connection' } };
  }

  let email: string | null;
  try {
    email = await userEmail(auth.value.auth.userId);
  } catch (err) {
    reportError(err, { route: 'admin-auth', service: 'supabase' });
    return { ok: false, status: 503, body: { error: 'Could not verify the admin. Try again in a moment.' } };
  }
  if (!isPlatformAdminEmail(email)) {
    return { ok: false, status: 403, body: { error: 'Not a platform admin' } };
  }

  return {
    ok: true,
    ctx: {
      adminUserId: auth.value.auth.userId,
      adminEmail: email!.toLowerCase(),
      apiKeyId: auth.value.key.id,
      now,
    },
  };
}
