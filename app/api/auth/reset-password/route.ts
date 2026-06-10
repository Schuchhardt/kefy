import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import { hashToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { token, password } = body as Record<string, unknown>;

  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const db = createSupabaseServer();

  const { data: record } = await db
    .from('kefy_password_reset_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: 'El enlace es inválido o ya fue utilizado' }, { status: 400 });
  }

  if (new Date(record.expires_at) < new Date()) {
    await db.from('kefy_password_reset_tokens').delete().eq('id', record.id);
    return NextResponse.json({ error: 'El enlace ha expirado. Solicita uno nuevo.' }, { status: 400 });
  }

  const newHash = await bcrypt.hash(password, 12);

  const { error: updateError } = await db
    .from('kefy_users')
    .update({ password_hash: newHash })
    .eq('id', record.user_id);

  if (updateError) {
    return NextResponse.json({ error: 'Error al actualizar la contraseña' }, { status: 500 });
  }

  // Delete the token (single-use)
  await db.from('kefy_password_reset_tokens').delete().eq('id', record.id);

  // Invalidate all existing refresh tokens for the user
  await db.from('kefy_refresh_tokens').delete().eq('user_id', record.user_id);

  return NextResponse.json({ ok: true });
}
