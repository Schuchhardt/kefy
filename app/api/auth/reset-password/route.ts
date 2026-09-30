import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import { checkRateLimit, clientIp, resetPasswordRule, rateLimitResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';
import { hashToken } from '@/lib/auth';

// Los errores llevan `code` (ver lib/auth-errors.ts): la página los traduce.

type ResetRecord = { id: string; user_id: string; expires_at: string };

/** Busca el token y dice si sirve: null si vale, o el código del problema. */
async function checkResetToken(token: string): Promise<
  { record: ResetRecord; problem: null } | { record: ResetRecord | null; problem: 'reset_invalid' | 'reset_expired' }
> {
  const db = createSupabaseServer();
  const { data: record } = await db
    .from('kefy_password_reset_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!record) return { record: null, problem: 'reset_invalid' };
  if (new Date(record.expires_at) < new Date()) return { record, problem: 'reset_expired' };
  return { record, problem: null };
}

const RESET_ERRORS = {
  reset_invalid: 'El enlace es inválido o ya fue utilizado',
  reset_expired: 'El enlace ha expirado. Solicita uno nuevo.',
} as const;

// ─── GET /api/auth/reset-password?token=… ────────────────────────────────────
// Comprueba el enlace antes de pedir la contraseña nueva. Antes la página
// dejaba escribir dos veces la contraseña y solo al enviar avisaba de que el
// enlace había caducado.

export async function GET(req: NextRequest) {
  const limit = await checkRateLimit(resetPasswordRule(clientIp(req)));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiados intentos. Intenta de nuevo más tarde.');
  }

  const token = new URL(req.url).searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token requerido', code: 'token_required' }, { status: 400 });
  }

  const { problem } = await checkResetToken(token);
  if (problem) {
    return NextResponse.json({ error: RESET_ERRORS[problem], code: problem }, { status: 400 });
  }
  return NextResponse.json({ valid: true });
}

export async function POST(req: NextRequest) {
  // El token de recuperación se compara contra la base: sin freno, este endpoint
  // permite sondear tokens a ciegas.
  const limit = await checkRateLimit(resetPasswordRule(clientIp(req)));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiados intentos. Intenta de nuevo más tarde.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  const { token, password } = body as Record<string, unknown>;

  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Token requerido', code: 'token_required' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'La contraseña debe tener al menos 8 caracteres', code: 'password_too_short' },
      { status: 400 },
    );
  }

  const db = createSupabaseServer();
  const { record, problem } = await checkResetToken(token);

  if (problem === 'reset_expired' && record) {
    await db.from('kefy_password_reset_tokens').delete().eq('id', record.id);
  }
  if (problem || !record) {
    const code = problem ?? 'reset_invalid';
    return NextResponse.json({ error: RESET_ERRORS[code], code }, { status: 400 });
  }

  const newHash = await bcrypt.hash(password, 12);

  const { error: updateError } = await db
    .from('kefy_users')
    .update({ password_hash: newHash })
    .eq('id', record.user_id);

  if (updateError) {
    reportError(new Error(updateError.message), {
      route: 'POST /api/auth/reset-password',
      service: 'supabase',
    });
    return NextResponse.json({ error: 'Error al actualizar la contraseña', code: 'generic' }, { status: 500 });
  }

  // Delete the token (single-use)
  await db.from('kefy_password_reset_tokens').delete().eq('id', record.id);

  // Invalidate all existing refresh tokens for the user
  await db.from('kefy_refresh_tokens').delete().eq('user_id', record.user_id);

  return NextResponse.json({ ok: true });
}
