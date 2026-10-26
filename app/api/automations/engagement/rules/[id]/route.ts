import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { deleteEngagementRule, updateEngagementRule } from '@/lib/services/engagement';

// ─── /api/automations/engagement/rules/[id] ──────────────────────────────────
// Editar y borrar una regla de la organización (lib/services/engagement.ts).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ rule: await updateEngagementRule(ctx, id, body) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/automations/engagement/rules/[id]', auth });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    await deleteEngagementRule(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/automations/engagement/rules/[id]', auth });
  }
}
