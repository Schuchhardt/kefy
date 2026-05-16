import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

const VALID_STATUSES = new Set(['draft', 'approved', 'scheduled', 'published', 'archived']);

// ─── GET /api/content/[itemId] ────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const db = createSupabaseServer();

  const { data: item, error } = await db
    .from('kefy_content_items')
    .select('*')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (error) {
    console.error('content GET [id] error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Include drafts
  const { data: drafts } = await db
    .from('kefy_content_drafts')
    .select('id, body, model, tokens_used, selected, created_at')
    .eq('content_item_id', itemId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ item, drafts: drafts ?? [] });
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

  const input = body as Record<string, unknown>;

  if (input.status !== undefined && !VALID_STATUSES.has(input.status as string)) {
    return NextResponse.json({ error: `Invalid status` }, { status: 422 });
  }

  const allowed = ['title', 'body', 'image_url', 'image_prompt', 'hashtags', 'status', 'metadata'] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in input) update[key] = input[key] ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 });
  }

  const db = createSupabaseServer();

  const { data: item, error } = await db
    .from('kefy_content_items')
    .update(update)
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('content PATCH error:', error.message);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ item });
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
