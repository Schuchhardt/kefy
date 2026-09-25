import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getContent, updateContent } from '@/lib/services/content';

// GET y PATCH delegan en lib/services/content.ts (compartido con el asistente).
// Esta ruta no depende de la marca activa: filtra por organización
// (brandScope 'org'), como siempre. ctx.brandId no se usa para filtrar.

// ─── GET /api/content/[itemId] ────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    // Include drafts
    const { item, drafts } = await getContent(ctx, itemId);
    return NextResponse.json({ item, drafts });
  } catch (e) {
    return serviceErrorResponse(e, { route: 'GET /api/content/[itemId]', auth });
  }
}

// ─── PATCH /api/content/[itemId] ─────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Las validaciones (422) y sus mensajes están en updateContent. Desde la UI
  // se puede pasar a cualquier estado.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await updateContent(ctx, itemId, body as Record<string, unknown>);
    return NextResponse.json(out);
  } catch (e) {
    return serviceErrorResponse(e, { route: 'PATCH /api/content/[itemId]', auth });
  }
}

// ─── DELETE /api/content/[itemId] ────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const db = createSupabaseServer();

  const { error } = await db
    .from('kefy_content_items')
    .delete()
    .eq('id', itemId)
    .eq('org_id', auth.orgId);

  if (error) {
    console.error('content DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
