import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();

  const { data: user } = await db
    .from('kefy_users')
    .select('id, email, name, created_at')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: org } = await db
    .from('kefy_organizations')
    .select('id, name, slug, plan')
    .eq('id', auth.orgId)
    .maybeSingle();

  return NextResponse.json({
    user,
    org,
    role: auth.role,
    plan: auth.plan,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, org_name, current_password, new_password } = body as Record<string, unknown>;

  const db = createSupabaseServer();

  // ── Password change ──────────────────────────────────────────────────────
  if (typeof current_password === 'string' || typeof new_password === 'string') {
    if (typeof current_password !== 'string' || !current_password) {
      return NextResponse.json({ error: 'La contraseña actual es requerida' }, { status: 400 });
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, { status: 400 });
    }

    const { data: userRow } = await db
      .from('kefy_users')
      .select('password_hash')
      .eq('id', auth.userId)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const match = await bcrypt.compare(current_password, userRow.password_hash);
    if (!match) {
      return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 400 });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const { error } = await db
      .from('kefy_users')
      .update({ password_hash: newHash })
      .eq('id', auth.userId);

    if (error) {
      return NextResponse.json({ error: 'Error al actualizar contraseña' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // ── Name update ──────────────────────────────────────────────────────────
  if (typeof org_name === 'string') {
    if (!['owner', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!org_name.trim()) {
      return NextResponse.json({ error: 'El nombre de la organización no puede estar vacío' }, { status: 400 });
    }

    const { data: updatedOrg, error: orgError } = await db
      .from('kefy_organizations')
      .update({ name: org_name.trim().slice(0, 100) })
      .eq('id', auth.orgId)
      .select('id, name, slug, plan')
      .maybeSingle();

    if (orgError || !updatedOrg) {
      return NextResponse.json({ error: 'Error al actualizar organización' }, { status: 500 });
    }

    return NextResponse.json({ org: updatedOrg });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
  }

  const { data: updated, error } = await db
    .from('kefy_users')
    .update({ name: name.trim() })
    .eq('id', auth.userId)
    .select('id, email, name, created_at')
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 });
  }

  return NextResponse.json({ user: updated });
}

