import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { memberLimitFor } from '@/lib/team';
import { reportError } from '@/lib/observability';

// ─── GET /api/team/members ───────────────────────────────────────────────────
// Miembros de la organización y estado del cupo del plan.
// Lo ve cualquier miembro; gestionarlo es otra cosa (ver POST /invitations).

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServer();

  const { data: memberships, error } = await db
    .from('kefy_org_memberships')
    .select('user_id, role, created_at, kefy_users(id, name, email)')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: true });

  if (error) {
    reportError(new Error(error.message), {
      route: 'GET /api/team/members', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'Failed to load members' }, { status: 500 });
  }

  const members = (memberships ?? []).map((m) => {
    const user = m.kefy_users as unknown as { id: string; name: string | null; email: string } | null;
    return {
      userId: m.user_id,
      role:   m.role,
      name:   user?.name ?? null,
      email:  user?.email ?? null,
      joinedAt: m.created_at,
      // Marca al propio solicitante para que la UI no le ofrezca eliminarse.
      isSelf: m.user_id === auth.userId,
    };
  });

  const { count: pending } = await db
    .from('kefy_org_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .is('accepted_at', null);

  const limit = memberLimitFor(auth.plan);
  const used = members.length + (pending ?? 0);

  return NextResponse.json({
    members,
    pendingInvitations: pending ?? 0,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  });
}
