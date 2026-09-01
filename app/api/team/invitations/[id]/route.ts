import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { canManageTeam } from '@/lib/team';
import { reportError } from '@/lib/observability';

// ─── DELETE /api/team/invitations/[id] ───────────────────────────────────────
// Revoca una invitación pendiente y libera el cupo que ocupaba.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createSupabaseServer();

  // El filtro por org_id es lo que impide revocar invitaciones de otra
  // organización conociendo su id.
  const { data, error } = await db
    .from('kefy_org_invitations')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .is('accepted_at', null)
    .select('id');

  if (error) {
    reportError(new Error(error.message), {
      route: 'DELETE /api/team/invitations/[id]', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'No se pudo revocar la invitación' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
