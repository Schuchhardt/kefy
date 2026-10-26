import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import type { ContentChannel } from '@/types/ai';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { generateStory, writeStoryVideoScript } from '@/lib/services/story';

export const runtime = 'nodejs';
export const maxDuration = 90;

const VALID_CHANNELS = new Set<ContentChannel>([
  'linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'generic',
]);

// ─── POST /api/content/story ───────────────────────────────────────────────────
// Generate a Story: a short caption (same copywriter as posts) + one vertical
// (9:16) image. Stores the result as content_type='story'.
// A separate action (PATCH) can later turn it into a short video script that
// the video pipeline produces (see lib/services/video.ts).
//
// Body:
//   channel   — optional (defaults to 'generic')
//   topic     — required
//   language? — 'es' (default) | 'en'
//   save?     — persist to DB (default true)

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

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

  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';

  // Texto, imagen vertical, cobro y guardado: generateStory.
  const ctx = serviceContext(auth, brand?.id ?? '', language, { brandScope: 'org', source: 'route' });
  try {
    const out = await generateStory(ctx, {
      topic:   input.topic as string,
      channel,
      save:    input.save !== false,
    });
    const payload = {
      ...(out.itemId ? { itemId: out.itemId } : {}),
      body:       out.body,
      hashtags:   out.hashtags,
      image_url:  out.image_url,
      model:      out.model,
      tokensUsed: out.tokensUsed,
    };
    const res = NextResponse.json(payload, { status: out.itemId ? 201 : 200 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/content/story', auth });
  }
}

// ─── PATCH /api/content/story ──────────────────────────────────────────────────
// "Generar video de esta story" — writes a short (1-3 shot) video script with
// Claude (lib/video/script.ts) and stores it in metadata.video_script, with
// the derived scenes in `slides`. The story's own image is reused as the first
// shot. Nothing is produced here: the player shows the production plan (tools
// + credits) and the user confirms it — same pipeline as reels
// (lib/services/video.ts).
//
// Body: { itemId: string }

export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const input  = body as Record<string, unknown>;
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : null;
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 422 });
  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';

  const ctx = serviceContext(auth, '', language, { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await writeStoryVideoScript(ctx, { itemId }));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/content/story', auth });
  }
}
