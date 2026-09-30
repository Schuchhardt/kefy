// ─── Errores de auth: código estable → texto traducido ───────────────────────
//
// Las rutas de /api/auth y de invitaciones devuelven `{ error, code }`. El
// `error` sigue en inglés o español según la ruta (lo leen los tests y los
// logs); la UI traduce el `code` con locales/*/auth.ts. Antes el registro
// enseñaba el texto crudo del API («Email already registered») aunque la
// página estuviera en español, y el login comparaba cadenas exactas.

import esAuth, { type AuthErrorCode } from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export type { AuthErrorCode } from '@/locales/es/auth';

const KNOWN = new Set<string>(Object.keys(esAuth.errors));

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Mensajes que las rutas antiguas devolvían sin código, por si llega uno. */
const LEGACY_MESSAGES: Record<string, AuthErrorCode> = {
  'invalid email or password': 'invalid_credentials',
  'valid email is required': 'invalid_email',
  'password is required': 'password_required',
  'password must be at least 8 characters': 'password_too_short',
  'la contraseña debe tener al menos 8 caracteres': 'password_too_short',
  'name is required': 'name_required',
  'organization name is required': 'org_required',
  'email already registered': 'email_taken',
  'invalid request body': 'invalid_body',
  'no organization found': 'no_organization',
  'token requerido': 'token_required',
  'el enlace es inválido o ya fue utilizado': 'reset_invalid',
  'el enlace ha expirado. solicita uno nuevo.': 'reset_expired',
};

/**
 * Traduce la respuesta de error de una ruta de auth. `status` 429 siempre es
 * rate limit (el limitador responde con su propio texto, sin código).
 */
export function authErrorMessage(
  body: { error?: unknown; code?: unknown } | null | undefined,
  lang: string,
  status?: number,
  opts: { rateLimitCode?: AuthErrorCode } = {},
): string {
  const t = lang === 'en' ? enAuth.errors : esAuth.errors;
  if (status === 429) return t[opts.rateLimitCode ?? 'rate_limited'];
  if (isAuthErrorCode(body?.code)) return t[body.code];
  if (typeof body?.error === 'string') {
    const legacy = LEGACY_MESSAGES[body.error.trim().toLowerCase()];
    if (legacy) return t[legacy];
  }
  return t.generic;
}

/** Código de la respuesta, si es uno conocido. */
export function authErrorCode(body: { code?: unknown } | null | undefined): AuthErrorCode | null {
  return isAuthErrorCode(body?.code) ? body.code : null;
}
