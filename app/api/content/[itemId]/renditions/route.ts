import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import {
  RENDITION_FORMATS, generateRendition, listRenditions, type RenditionFormat,
} from '@/lib/services/renditions';

export const runtime = 'nodejs';
export const maxDuration = 180;

const ROUTE = 'POST /api/content/[itemId]/renditions';

// ─── GET /api/content/[itemId]/renditions ─────────────────────────────────────
// Lists every format generated so far for this item: the primary format
// (synthesized from the item's own columns) plus any alternate-format
// renditions generated on demand (kefy_content_renditions).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json({ renditions: await listRenditions(ctx, itemId) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/content/[itemId]/renditions', auth });
  }
}

// ─── POST /api/content/[itemId]/renditions ────────────────────────────────────
// Generates (or returns, if already ready) the given format for this item —
// so the same topic can be published as post/carousel/reel/story depending
// on the destination network, without re-typing the idea from scratch.
//
// Body: { format: 'post' | 'carousel' | 'reel' | 'story', language?: 'es' | 'en' }
//
// La generación, el cobro y las devoluciones viven en generateRendition
// (lib/services/renditions.ts).

export async function POST(
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
  const input  = (body ?? {}) as Record<string, unknown>;
  const format = input.format as RenditionFormat;
  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';
  if (!RENDITION_FORMATS.includes(format)) {
    return NextResponse.json({ error: `format must be one of: ${RENDITION_FORMATS.join(', ')}` }, { status: 422 });
  }

  const ctx = serviceContext(auth, '', language, { brandScope: 'org', source: 'route' });
  try {
    const { rendition, created } = await generateRendition(ctx, { itemId, format });
    return NextResponse.json({ rendition }, { status: created ? 201 : 200 });
  } catch (err) {
    return serviceErrorResponse(err, { route: ROUTE, auth });
  }
}
