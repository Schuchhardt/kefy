import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { generateSlideText } from '@/lib/ai';
import type { ContentChannel } from '@/types/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/slide-text ─────────────────────────────────────────────
// Regenerate the on-image text (title + body) of ONE carousel slide / reel
// scene. Returns { title, body } — the caller applies it to the slide and
// persists via the item PATCH (auto-save), so nothing is saved here.
//
// Body:
//   kind      — 'carousel' | 'reel' (default 'carousel')
//   channel?  — target channel (defaults to 'generic')
//   title?    — current slide title (rewrite seed)
//   body?     — current slide body (rewrite seed)
//   feedback? — optional instruction on what to change
//   language? — 'es' (default) | 'en'

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

  const kind: 'carousel' | 'reel' = input.kind === 'reel' ? 'reel' : 'carousel';

  // Content items may carry channels outside the copy-generation set
  // (youtube, reddit, ads…); fall back to 'generic' rather than erroring.
  const channel: ContentChannel = VALID_CHANNELS.has(input.channel as ContentChannel)
    ? (input.channel as ContentChannel)
    : 'generic';

  const db = createSupabaseServer();
  const { data: brandKit } = await db
    .from('kefy_brand_kits')
    .select('name, tagline, tone')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  try {
    const result = await generateSlideText({
      kind,
      channel,
      title:     typeof input.title === 'string' ? input.title.slice(0, 200) : undefined,
      body:      typeof input.body === 'string' ? input.body.slice(0, 400) : undefined,
      feedback:  typeof input.feedback === 'string' ? input.feedback.slice(0, 300) : undefined,
      language:  input.language === 'en' ? 'en' : 'es',
      tone:      brandKit?.tone ?? [],
      brandName: brandKit?.name    ?? undefined,
      tagline:   brandKit?.tagline ?? undefined,
    });
    return NextResponse.json({ title: result.title, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Slide text generation failed';
    console.error('slide-text generate error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
