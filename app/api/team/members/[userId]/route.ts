import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { canManageTeam } from '@/lib/team';
import { reportError } from '@/lib/observability';

// ─── DELETE /api/team/members/[userId] ───────────────────────────────────────
// Saca a alguien de la organización. No borra su usuario: solo la membresía.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;

  // Quitarse a uno mismo dejaría la organización sin quien la gestione si
  // además es el dueño, y en cualquier caso es un accidente más que una acción.
  if (userId === auth.userId) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 422 });
  }

  const db = createSupabaseServer();

  const { data: objetivo } = await db
    .from('kefy_org_memberships')
    .select('role')
    .eq('org_id', auth.orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!objetivo) {
    return NextResponse.json({ error: 'Esa persona no es parte de tu equipo' }, { status: 404 });
  }

  // El dueño no se elimina: la organización quedaría huérfana.
  if (objetivo.role === 'owner') {
    return NextResponse.json({ error: 'No se puede eliminar al dueño de la organización' }, { status: 422 });
  }

  // Un administrador no puede echar a otro administrador; eso lo decide el dueño.
  if (objetivo.role === 'admin' && auth.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo el dueño puede eliminar a un administrador' },
      { status: 403 },
    );
  }

  const { error } = await db
    .from('kefy_org_memberships')
    .delete()
    .eq('org_id', auth.orgId)
    .eq('user_id', userId);

  if (error) {
    reportError(new Error(error.message), {
      route: 'DELETE /api/team/members/[userId]', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'No se pudo eliminar al miembro' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
