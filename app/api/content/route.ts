import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import type { SlideInput } from '@/types/content';

const VALID_CHANNELS = new Set([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);
const VALID_STATUSES = new Set(['draft', 'approved', 'scheduled', 'published', 'archived']);
const VALID_CONTENT_TYPES = new Set(['post', 'carousel', 'reel']);

function sanitizeSlides(raw: unknown): SlideInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SlideInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (typeof r !== 'object' || r === null) return null;
    const s = r as Record<string, unknown>;
    const order = typeof s.slide_order === 'number' ? s.slide_order : i + 1;
    out.push({
      slide_order:      order,
      title:            typeof s.title === 'string' ? s.title.slice(0, 200) : null,
      body:             typeof s.body  === 'string' ? s.body.slice(0, 2000) : null,
      image_url:        typeof s.image_url === 'string' && s.image_url ? s.image_url : null,
      duration_seconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : null,
    });
  }
  // Normalize order to 1..N to avoid duplicates
  out.sort((a, b) => a.slide_order - b.slide_order);
  out.forEach((s, i) => { s.slide_order = i + 1; });
  return out;
}

// ─── GET /api/content ─────────────────────────────────────────────────────────
// List content items for the active brand. Supports ?channel= ?status= ?limit= ?offset=

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');
  const status  = searchParams.get('status');
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset  = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  const db = createSupabaseServer();

  let query = db
    .from('kefy_content_items')
    .select('id, channel, content_type, status, title, body, image_url, hashtags, slides, video_url, created_by, created_at, updated_at')
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (channel && VALID_CHANNELS.has(channel)) query = query.eq('channel', channel);
  if (status  && VALID_STATUSES.has(status))  query = query.eq('status', status);

  const { data, error, count } = await query;

  if (error) {
    console.error('content GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
  }

  const res = NextResponse.json({ items: data ?? [], total: count ?? 0 });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
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

  const input = body as Record<string, unknown>;

  if (!input.channel || !VALID_CHANNELS.has(input.channel as string)) {
    return NextResponse.json({ error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}` }, { status: 422 });
  }

  const contentType = typeof input.content_type === 'string' && VALID_CONTENT_TYPES.has(input.content_type)
    ? input.content_type
    : 'post';

  // Carousel/reel require at least one slide
  let slides: SlideInput[] | null = null;
  if (contentType === 'carousel' || contentType === 'reel') {
    slides = sanitizeSlides(input.slides);
    if (!slides || slides.length === 0) {
      return NextResponse.json(
        { error: `${contentType} requires a non-empty 'slides' array` },
        { status: 422 },
      );
    }
  }

  const videoUrl = contentType === 'reel' && typeof input.video_url === 'string' && input.video_url
    ? input.video_url
    : null;

  // For carousel/reel, derive cover image from first slide if not explicitly provided
  const explicitImage = typeof input.image_url === 'string' && input.image_url ? input.image_url : null;
  const coverImage = explicitImage
    ?? (slides ? slides.find((s) => !!s.image_url)?.image_url ?? null : null);

  const db = createSupabaseServer();

  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  const { data: item, error } = await db
    .from('kefy_content_items')
    .insert({
      org_id:       auth.orgId,
      brand_id:     postBrand.id,
      brand_kit_id: brandKit?.id ?? null,
      created_by:   auth.userId,
      channel:      input.channel,
      content_type: contentType,
      title:        typeof input.title === 'string'  ? input.title.trim().slice(0, 200)  : null,
      body:         typeof input.body  === 'string'  ? input.body.trim()                  : null,
      image_url:    coverImage,
      slides:       slides,
      video_url:    videoUrl,
      hashtags:     Array.isArray(input.hashtags) ? input.hashtags.filter((h) => typeof h === 'string') : [],
      status:       'draft',
    })
    .select('*')
    .single();

  if (error || !item) {
    console.error('content POST error:', error?.message);
    return NextResponse.json({ error: 'Failed to create content item' }, { status: 500 });
  }

  const res = NextResponse.json({ item }, { status: 201 });
  if (postCookieHeader) res.headers.set('Set-Cookie', postCookieHeader);
  return res;
}
