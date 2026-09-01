import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { generateContentImage } from '@/lib/ai';
import { guardAiRequest } from '@/lib/ai-guard';
import { reportError } from '@/lib/observability';
import type { BrandImageContext } from '@/types/ai';
import { uploadBase64Image } from '@/lib/storage';

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
//     generated visual style/composition (max 3)

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

  const sanitizedPrompt = (input.prompt as string).trim().slice(0, 1000);
  const itemId = typeof input.itemId === 'string' && input.itemId ? input.itemId : null;
  const referenceImages = Array.isArray(input.reference_image_urls)
    ? input.reference_image_urls.filter((u): u is string => typeof u === 'string').slice(0, 3)
    : undefined;

  // ── Fetch brand kit for this org ──────────────────────────────────────────
  const db = createSupabaseServer();

  // Mark the item as generating up front so a page reload (or the user
  // opening the item mid-generation) shows a pending state instead of a
  // blank/failed-looking image slot for the several minutes this can take.
  if (itemId) {
    await db
      .from('kefy_content_items')
      .update({ image_status: 'generating' })
      .eq('id', itemId)
      .eq('org_id', auth.orgId);
  }

  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('name, tone, primary_color, secondary_color, accent_color, logo_url')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // Download logo to base64 if available (SSRF-safe: only Supabase Storage URLs)
  let logoB64: string | undefined;
  let logoMimeType: string | undefined;
  const logoUrl: string | null = brandKit?.logo_url ?? null;
  if (logoUrl) {
    try {
      const logoRes = await fetch(logoUrl);
      if (logoRes.ok) {
        const buf = await logoRes.arrayBuffer();
        logoB64      = Buffer.from(buf).toString('base64');
        logoMimeType = logoRes.headers.get('content-type') ?? 'image/png';
      }
    } catch {
      // Non-fatal: proceed without logo reference
    }
  }

  const brand: BrandImageContext | undefined = brandKit ? {
    name:           brandKit.name          ?? undefined,
    primaryColor:   brandKit.primary_color   ?? undefined,
    secondaryColor: brandKit.secondary_color ?? undefined,
    accentColor:    brandKit.accent_color    ?? undefined,
    tone:           brandKit.tone            ?? undefined,
    logoB64,
    logoMimeType,
  } : undefined;

  const guard = await guardAiRequest(req, {
    auth, operation: 'image', route: 'POST /api/content/image',
  });
  if (guard.blocked) {
    // El item queda marcado para que la UI no siga esperando una imagen que no
    // va a llegar.
    if (itemId) {
      await db.from('kefy_content_items').update({ image_status: 'error' }).eq('id', itemId).eq('org_id', auth.orgId);
    }
    return guard.blocked;
  }

  let result;
  try {
    result = await generateContentImage({
      prompt:  sanitizedPrompt,
      size:    (input.size    as '1024x1024' | '1536x1024' | '1024x1536' | '1080x1080' | '1024x1792' | 'auto' | undefined) ?? '1024x1024',
      quality: (input.quality as 'low' | 'medium' | 'high' | 'auto' | undefined) ?? 'medium',
      brand,
      referenceImages,
    });
  } catch (err) {
    await guard.refund();
    reportError(err, { route: 'POST /api/content/image', auth, service: 'ai' });
    const msg = err instanceof Error ? err.message : 'Image generation failed';
    if (itemId) {
      await db.from('kefy_content_items').update({ image_status: 'error' }).eq('id', itemId).eq('org_id', auth.orgId);
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // La imagen se guarda limpia. El texto del slide se dibuja como overlay HTML
  // en la vista previa y se quema sobre los píxeles al publicar, con la zona
  // segura de la red destino (ver lib/image-processor y lib/preview-layout).
  const finalB64 = result.b64;

  // Upload base64 to Supabase Storage and get a public URL
  let publicUrl: string;
  try {
    publicUrl = await uploadBase64Image(finalB64, auth.orgId, `generated-${Date.now()}.jpeg`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Storage upload failed';
    console.error('image storage error:', msg);
    if (itemId) {
      await db.from('kefy_content_items').update({ image_status: 'error' }).eq('id', itemId).eq('org_id', auth.orgId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const imagePayload = { url: publicUrl, revisedPrompt: result.revisedPrompt };

  // Optionally link to a content item
  if (itemId) {
    const { error } = await db
      .from('kefy_content_items')
      .update({ image_url: publicUrl, image_prompt: sanitizedPrompt, image_status: 'ready' })
      .eq('id', itemId)
      .eq('org_id', auth.orgId);

    if (error) {
      console.error('image link to item error:', error.message);
      // Non-fatal: return result anyway
    }
  }

  return NextResponse.json({ image: imagePayload }, { status: 201 });
}
