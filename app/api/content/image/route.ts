import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest, ACTIVE_BRAND_COOKIE } from '@/lib/auth';
import type { JWTPayload } from '@/types/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { generateImageForItem, type ImageQuality, type ImageSize } from '@/lib/services/content';

export const runtime = 'nodejs';
export const maxDuration = 120;

const VALID_SIZES    = new Set(['1024x1024', '1536x1024', '1024x1536', '1080x1080', '1024x1792', 'auto']);
const VALID_QUALITIES = new Set(['low', 'medium', 'high', 'auto']);

// ─── POST /api/content/image ──────────────────────────────────────────────────
// Generate an image with gpt-image-2.
// Uploads the result to Supabase Storage and returns a public URL.
// Optionally links the image URL to an existing content item.
//
// Body:
//   prompt     — required (image description)
//   size?      — '1024x1024' (default) | '1536x1024' | '1024x1536' | '1080x1080' | '1024x1792' | 'auto'
//   quality?   — 'medium' (default) | 'low' | 'high' | 'auto'
//   itemId?    — if provided, updates the content item's image_url
//   reference_image_urls? — public URLs of reference images to guide the
//     generated visual style/composition (max 3). Solo se aceptan las del
//     Storage de Kefy (kefy-reference-images / kefy-content-media /
//     kefy-content-images).

/**
 * Marca cuyo brand kit da colores, tono y logo a la imagen. La ruta no depende
 * de la marca activa para nada más, así que no usa getBrandFromRequest (que
 * además crearía una marca o fijaría la cookie): toma la de la cookie si es de
 * la organización y, si no, la única marca activa de la organización. Con
 * varias marcas y sin cookie se genera sin kit, igual que antes con el
 * `.eq('org_id').maybeSingle()` que fallaba con más de un kit.
 */
async function kitBrandId(req: NextRequest, auth: JWTPayload): Promise<string> {
  const db = createSupabaseServer();
  const cookieBrandId = req.cookies.get(ACTIVE_BRAND_COOKIE)?.value;
  if (cookieBrandId) {
    const { data } = await db
      .from('kefy_brands')
      .select('id')
      .eq('id', cookieBrandId)
      .eq('org_id', auth.orgId)
      .eq('archived', false)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: only } = await db
    .from('kefy_brands')
    .select('id')
    .eq('org_id', auth.orgId)
    .eq('archived', false)
    .maybeSingle();
  return (only?.id as string | undefined) ?? '';
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 422 });
  }
  if (input.size !== undefined && !VALID_SIZES.has(input.size as string)) {
    return NextResponse.json({ error: `size must be one of: ${[...VALID_SIZES].join(', ')}` }, { status: 422 });
  }
  if (input.quality !== undefined && !VALID_QUALITIES.has(input.quality as string)) {
    return NextResponse.json({ error: `quality must be one of: ${[...VALID_QUALITIES].join(', ')}` }, { status: 422 });
  }

  const itemId = typeof input.itemId === 'string' && input.itemId ? input.itemId : null;
  const referenceImages = Array.isArray(input.reference_image_urls)
    ? input.reference_image_urls.filter((u): u is string => typeof u === 'string').slice(0, 3)
    : undefined;

  // Generación, cobro (antes de marcar el item como 'generating'), subida y
  // enlace al item: generateImageForItem.
  const ctx = serviceContext(auth, await kitBrandId(req, auth), 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await generateImageForItem(ctx, {
      itemId,
      prompt:             input.prompt as string,
      size:               input.size as ImageSize | undefined,
      quality:            input.quality as ImageQuality | undefined,
      referenceImageUrls: referenceImages,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return serviceErrorResponse(e, { route: 'POST /api/content/image', auth });
  }
}
