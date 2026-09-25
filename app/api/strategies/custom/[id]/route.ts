import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { deleteCustomStrategy, getCustomStrategy } from '@/lib/services/custom-strategy';
import { saveCustomStrategy } from '@/lib/services/strategy';

type Params = { params: Promise<{ id: string }> };

function language(req: NextRequest): 'es' | 'en' {
  return req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'es';
}

function canEdit(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

// GET /api/strategies/custom/[id] → { strategy }
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const ctx = serviceContext(auth, '', language(req), { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ strategy: await getCustomStrategy(ctx, id) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies/custom/[id]', auth });
  }
}

// PATCH /api/strategies/custom/[id]
// Body: cualquier campo de la estrategia, y `activate?` → { strategy, selection }
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEdit(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const { activate, id: _ignored, ...fields } = input;

  const { id } = await params;
  const ctx = serviceContext(auth, '', language(req), { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await saveCustomStrategy(ctx, { ...fields, id, activate: activate === true }));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/strategies/custom/[id]', auth });
  }
}

// DELETE /api/strategies/custom/[id] → 204. Si era la activa, la org vuelve a
// la del catálogo que tuviera.
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEdit(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const ctx = serviceContext(auth, '', language(req), { brandScope: 'org', source: 'route' });
  try {
    await deleteCustomStrategy(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/strategies/custom/[id]', auth });
  }
}
