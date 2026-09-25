import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { canManageTeam } from '@/lib/team';
import { reportError } from '@/lib/observability';

// ─── DELETE /api/api-keys/[keyId] ────────────────────────────────────────────
// Revoca una API key. No se borra la fila: la auditoría de acciones
// (kefy_assistant_actions.api_key_id) sigue apuntando a ella. La revocación es
// inmediata porque cada petición con la key vuelve a leer revoked_at.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { keyId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(keyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('org_id', auth.orgId)
    .is('revoked_at', null)
    .select('id');

  if (error) {
    reportError(new Error(error.message), {
      route: 'DELETE /api/api-keys/[keyId]', auth, service: 'supabase', extra: { keyId },
    });
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
