import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { generateTextPost } from '@/lib/services/content';
import type { ContentChannel, AIModel } from '@/types/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const language: 'es' | 'en' = input.language === 'en' ? 'en' : 'es';

  // La generación (kit de marca, cobro con la guardia de gasto, IA y guardado)
  // vive en generateTextPost. El cobro va después de validar el cuerpo para
  // que una petición malformada no gaste cuota del usuario.
  const ctx = serviceContext(auth, brand?.id ?? '', language, { brandScope: 'org', source: 'route' });
  const shouldSave = input.save !== false; // default true

  try {
    const out = await generateTextPost(ctx, {
      topic:  input.topic as string,
      channel,
      model:  input.model as AIModel | undefined,
      itemId: typeof input.itemId === 'string' && input.itemId ? input.itemId : null,
      save:   shouldSave,
    });

    if (!shouldSave) return NextResponse.json({ result: out.result });

    const res = NextResponse.json({ itemId: out.itemId, result: out.result, draft: out.draft }, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (e) {
    return serviceErrorResponse(e, { route: 'POST /api/content/generate', auth });
  }
}
