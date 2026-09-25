import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { requireActiveSubscription } from '@/lib/subscription';
import { checkRateLimit, publishRule, rateLimitResponse } from '@/lib/rate-limit';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { publishContent } from '@/lib/services/publish';
import type { ContentType } from '@/types/content';

const VALID_FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

// ─── POST /api/social/publish ─────────────────────────────────────────────────
// Publish a content item immediately to one or more social accounts.
//
// Body:
//   content_item_id     — required
//   social_account_ids  — required (array of account IDs)
//   format?              — 'post' | 'carousel' | 'reel' | 'story' (defaults to
//                          the item's own content_type). When it differs, the
//                          published media comes from that alternate-format
//                          rendition (kefy_content_renditions) instead of the
//                          item itself — the same topic, published as a
//                          different format depending on the target network.

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Publicar es «crear»: se corta con el trial vencido o el pago fallido, igual
  // que la generación. Leer y exportar lo ya creado sigue funcionando.
  const blocked = await requireActiveSubscription(auth.orgId);
  if (blocked) return blocked;

  const limit = await checkRateLimit(publishRule(auth.orgId));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiadas publicaciones en poco tiempo. Espera un momento.');
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.content_item_id !== 'string' || !input.content_item_id) {
    return NextResponse.json({ error: 'content_item_id is required' }, { status: 422 });
  }
  if (!Array.isArray(input.social_account_ids) || input.social_account_ids.length === 0) {
    return NextResponse.json({ error: 'social_account_ids must be a non-empty array' }, { status: 422 });
  }
  if (input.format !== undefined && !VALID_FORMATS.includes(input.format as ContentType)) {
    return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 422 });
  }

  const accountIds = (input.social_account_ids as unknown[]).filter(
    (id): id is string => typeof id === 'string',
  );
  if (accountIds.length === 0) {
    return NextResponse.json({ error: 'social_account_ids must contain valid IDs' }, { status: 422 });
  }

  // La ruta es de toda la organización (brandScope 'org'): el servicio exige
  // que las cuentas sean de la marca del contenido.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    const out = await publishContent(ctx, {
      itemId:     input.content_item_id,
      accountIds,
      format:     input.format as ContentType | undefined,
      mode:       'now',
    });
    return NextResponse.json(out.body, { status: out.status });
  } catch (err) {
    return serviceErrorResponse(err, { route: '/api/social/publish', auth });
  }
}
