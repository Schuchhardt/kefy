import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── GET /api/content-library ────────────────────────────────────────────────
// List content library items (global, shared across all orgs).
//
// Query params:
//   industry_id?  — filter by industry UUID
//   content_type? — 'post' | 'carousel' | 'reel' | 'story'
//   language?     — 'es' (default) | 'en'
//   limit?        — default 20, max 50
//   offset?       — default 0
//
// If industry_id is not provided and the user is authenticated, auto-detects
// from the user's brand kit industry field.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20') || 20));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0);
  const langParam    = searchParams.get('language');
  const language     = langParam === 'en' ? 'en' : 'es';
  const contentType  = searchParams.get('content_type') || null;
  let industryId     = searchParams.get('industry_id') || null;

  const db = createSupabaseServer();

  // Auto-detect industry from brand kit if not specified
  if (!industryId) {
    const { data: brandKit } = await db
      .from('kefy_brand_kits')
      .select('industry')
      .eq('org_id', auth.orgId)
      .maybeSingle();

    if (brandKit?.industry) {
      const { data: industryRow } = await db
        .from('kefy_content_industries')
        .select('id')
        .or(`slug.eq.${brandKit.industry},name_es.ilike.${brandKit.industry},name_en.ilike.${brandKit.industry}`)
        .limit(1)
        .maybeSingle();

      if (industryRow?.id) industryId = industryRow.id;
    }
  }

  // Build query
  let query = db
    .from('kefy_content_library')
    .select('*, kefy_content_industries!inner(slug, name_es, name_en, icon)', { count: 'exact' })
    .eq('language', language)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (industryId)  query = query.eq('industry_id', industryId);
  if (contentType) query = query.eq('content_type', contentType);

  const { data, count, error } = await query;

  if (error) {
    console.error('[api/content-library] query error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch library items' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((row: any) => ({
    id:            row.id,
    industry_id:   row.industry_id,
    content_type:  row.content_type,
    title:         row.title,
    body:          row.body,
    hashtags:      row.hashtags,
    image_url:     row.image_url,
    image_prompt:  row.image_prompt,
    slides:        row.slides,
    source:        row.source,
    language:      row.language,
    created_at:    row.created_at,
    industry_slug: row.kefy_content_industries?.slug ?? '',
    industry_name: language === 'en'
      ? (row.kefy_content_industries?.name_en ?? '')
      : (row.kefy_content_industries?.name_es ?? ''),
    industry_icon: row.kefy_content_industries?.icon ?? '',
  }));

  return NextResponse.json({ items, total: count ?? 0 });
}
