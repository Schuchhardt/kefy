import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { createManualContent, listContent } from '@/lib/services/content';

// La lógica vive en lib/services/content.ts, compartida con las herramientas
// del asistente. Aquí solo quedan auth, marca activa y el formato HTTP.

// ─── GET /api/content ─────────────────────────────────────────────────────────
// List content items for the active brand. Supports ?channel= ?status= ?limit= ?offset=

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await listContent(ctx, {
      channel: searchParams.get('channel'),
      status:  searchParams.get('status'),
      limit,
      offset,
    });
    const res = NextResponse.json(out);
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (e) {
    return serviceErrorResponse(e, { route: 'GET /api/content', auth });
  }
}

// ─── POST /api/content ────────────────────────────────────────────────────────
// Create a new content item manually (without AI generation).

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand: postBrand, setCookieHeader: postCookieHeader } = await getBrandFromRequest(req, auth);
  if (!postBrand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Las validaciones (422) y sus mensajes están en createManualContent.
  const ctx = serviceContext(auth, postBrand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await createManualContent(ctx, body as Record<string, unknown>);
    const res = NextResponse.json(out, { status: 201 });
    if (postCookieHeader) res.headers.set('Set-Cookie', postCookieHeader);
    return res;
  } catch (e) {
    return serviceErrorResponse(e, { route: 'POST /api/content', auth });
  }
}
