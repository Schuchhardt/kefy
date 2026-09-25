import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { requireActiveSubscription } from '@/lib/subscription';
import { checkRateLimit, publishRule, rateLimitResponse } from '@/lib/rate-limit';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listScheduledPosts, publishContent } from '@/lib/services/publish';
import type { ContentType } from '@/types/content';

const VALID_FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

// ─── GET /api/social/schedule ─────────────────────────────────────────────────
// List scheduled posts for the org.
// Query: ?status= ?limit= ?offset=

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json(await listScheduledPosts(ctx, { status, limit, offset }));
  } catch (err) {
    return serviceErrorResponse(err, { route: '/api/social/schedule', auth });
  }
}

// ─── POST /api/social/schedule ────────────────────────────────────────────────
// Schedule a content item to one or more social accounts.
//
// Body:
//   content_item_id    — required
//   social_account_id  — single account (kept for backwards compatibility)
//   social_account_ids — array of account IDs (preferred; union with social_account_id)
//   scheduled_at       — ISO 8601 datetime (required; must be in the future)
//   format?             — 'post' | 'carousel' | 'reel' | 'story' (defaults to
//                         the item's own content_type; see /api/social/publish
//                         for the alternate-format rendition behavior)

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
  if (typeof input.scheduled_at !== 'string' || !input.scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required (ISO 8601)' }, { status: 422 });
  }
  if (input.format !== undefined && !VALID_FORMATS.includes(input.format as ContentType)) {
    return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 422 });
  }

  const scheduledAt = new Date(input.scheduled_at);
  if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return NextResponse.json({ error: 'scheduled_at must be a valid future datetime' }, { status: 422 });
  }

  // Collect account IDs — accept both singular and plural forms
  const accountIdSet = new Set<string>();
  if (typeof input.social_account_id === 'string' && input.social_account_id) {
    accountIdSet.add(input.social_account_id);
  }
  if (Array.isArray(input.social_account_ids)) {
    (input.social_account_ids as unknown[]).forEach((id) => {
      if (typeof id === 'string' && id) accountIdSet.add(id);
    });
  }

  if (accountIdSet.size === 0) {
    return NextResponse.json(
      { error: 'social_account_id or social_account_ids is required' },
      { status: 422 },
    );
  }

  // La ruta es de toda la organización (brandScope 'org'): el servicio exige
  // que las cuentas sean de la marca del contenido.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    const out = await publishContent(ctx, {
      itemId:      input.content_item_id,
      accountIds:  [...accountIdSet],
      format:      input.format as ContentType | undefined,
      mode:        'schedule',
      scheduledAt: scheduledAt.toISOString(),
    });
    return NextResponse.json(out.body, { status: out.status });
  } catch (err) {
    return serviceErrorResponse(err, { route: '/api/social/schedule', auth });
  }
}
