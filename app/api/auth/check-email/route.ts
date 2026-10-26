import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { checkRateLimit, checkEmailRule, clientIp, rateLimitResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/observability';

// Primer paso de la pantalla de acceso (/{lang}/access): con el email decide si
// se pide la contraseña (ya hay cuenta) o nombre y contraseña (cuenta nueva).
// Revela si un email está registrado —el registro ya lo hacía con
// `email_taken`—, así que va con su propio rate limit por IP.

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(checkEmailRule(clientIp(req)));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiados intentos seguidos. Espera unos minutos.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  const email = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).email : undefined;
  if (typeof email !== 'string' || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: 'Valid email is required', code: 'invalid_email' }, { status: 400 });
  }

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_users')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    reportError(error, { route: 'POST /api/auth/check-email' });
    return NextResponse.json({ error: 'Could not check email', code: 'generic' }, { status: 500 });
  }

  return NextResponse.json({ exists: !!data });
}
