import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { generateContentText, type ContentChannel, type AIModel } from '@/lib/ai';

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);
const VALID_MODELS = new Set<AIModel>(['claude', 'gpt']);

// ─── POST /api/content/generate ───────────────────────────────────────────────
// Generate post text with Claude or GPT-4o.
// Optionally saves result as a new content item + draft record.
//
// Body:
//   channel    — required
//   topic      — required (what to write about)
//   model?     — 'claude' (default) | 'gpt'
//   language?  — 'es' (default) | 'en'
//   itemId?    — existing content item to attach the draft to
//   save?      — if true, create/update item and store draft (default true)

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

  // Validate — channel is optional; defaults to 'generic' (multi-channel).
  // Zernio adapts per platform at publish time.
  let channel: ContentChannel = 'generic';
  if (input.channel !== undefined && input.channel !== null && input.channel !== '') {
    if (!VALID_CHANNELS.has(input.channel as ContentChannel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}` },
        { status: 422 },
      );
    }
    channel = input.channel as ContentChannel;
  }
  if (typeof input.topic !== 'string' || !input.topic.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 422 });
  }
  if (input.model !== undefined && !VALID_MODELS.has(input.model as AIModel)) {
    return NextResponse.json({ error: `model must be 'claude' or 'gpt'` }, { status: 422 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);

  const db = createSupabaseServer();

  // Fetch brand kit context if available
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('id, name, tagline, tone, industry')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // Run generation
  let result;
  try {
    result = await generateContentText({
      channel,
      topic:     (input.topic as string).trim().slice(0, 500),
      model:     (input.model as AIModel | undefined) ?? 'claude',
      language:  input.language === 'en' ? 'en' : 'es',
      tone:      brandKit?.tone ?? [],
      brandName: brandKit?.name  ?? undefined,
      tagline:   brandKit?.tagline ?? undefined,
      extraCtx:  brandKit?.industry ? `Industry: ${brandKit.industry}.` : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI generation failed';
    console.error('generate error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const shouldSave = input.save !== false; // default true
  if (!shouldSave) {
    return NextResponse.json({ result });
  }

  // Resolve or create content item
  let itemId: string;
  if (typeof input.itemId === 'string' && input.itemId) {
    // Verify ownership
    const { data: existing } = await db
      .from('kefy_content_items')
      .select('id')
      .eq('id', input.itemId)
      .eq('org_id', auth.orgId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }
    itemId = existing.id;
  } else {
    // Create new item
    const { data: newItem, error: itemError } = await db
      .from('kefy_content_items')
      .insert({
        org_id:       auth.orgId,
        brand_id:     brand?.id ?? null,
        brand_kit_id: brandKit?.id ?? null,
        created_by:   auth.userId,
        channel,
        body:         result.body,
        hashtags:     result.hashtags,
        status:       'draft',
      })
      .select('id')
      .single();

    if (itemError || !newItem) {
      console.error('content item insert error:', itemError?.message);
      return NextResponse.json({ error: 'Failed to save content item' }, { status: 500 });
    }
    itemId = newItem.id;
  }

  // Deselect previous drafts for this item
  await db
    .from('kefy_content_drafts')
    .update({ selected: false })
    .eq('content_item_id', itemId);

  // Insert draft
  const { data: draft, error: draftError } = await db
    .from('kefy_content_drafts')
    .insert({
      content_item_id: itemId,
      org_id:          auth.orgId,
      body:            result.body,
      model:           result.model,
      tokens_used:     result.tokensUsed,
      selected:        true,
    })
    .select('id, body, model, tokens_used, selected, created_at')
    .single();

  if (draftError || !draft) {
    console.error('draft insert error:', draftError?.message);
    // Non-fatal — item was created, just log
  }

  // Update item body + hashtags with latest generation
  await db
    .from('kefy_content_items')
    .update({ body: result.body, hashtags: result.hashtags })
    .eq('id', itemId);

  const res = NextResponse.json({ itemId, result, draft }, { status: 201 });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
