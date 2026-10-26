import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { deleteLead, updateLead } from '@/lib/services/leads';

// PATCH /api/automations/leads/[id]
// Allowed: stage, score, notes, tags, contacted, contacted_at, converted, converted_at, display_name, avatar_url
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ lead: await updateLead(ctx, id, body) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/automations/leads/[id]', auth });
  }
}

// DELETE /api/automations/leads/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    await deleteLead(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/automations/leads/[id]', auth });
  }
}
