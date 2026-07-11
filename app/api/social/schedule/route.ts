import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
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

  const VALID_STATUSES = new Set(['pending', 'scheduled', 'published', 'failed', 'cancelled']);

  const db = createSupabaseServer();

  let query = db
    .from('kefy_scheduled_posts')
    .select(`
      id, status, scheduled_at, published_at, error_message,
      zernio_post_id, platform_post_id, created_at,
      kefy_content_items ( id, channel, title, body, image_url ),
      kefy_social_accounts ( id, platform, username, avatar_url )
    `)
    .eq('org_id', auth.orgId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status && VALID_STATUSES.has(status)) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    console.error('schedule GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }

  return NextResponse.json({ posts: data ?? [] });
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

  const accountIds = [...accountIdSet];
  const db = createSupabaseServer();

  // Verify ownership of content item
  const { data: item } = await db
    .from('kefy_content_items')
    .select('id, body, image_url, hashtags, channel, status, content_type, slides, video_url')
    .eq('id', input.content_item_id)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: 'Content item not found' }, { status: 404 });

  const format = (input.format as ContentType | undefined) ?? (item.content_type as ContentType);

  let scheduleSource: {
    body: string | null;
    image_url: string | null;
    slides: unknown;
    video_url: string | null;
    hashtags: string[];
  };
  if (format === item.content_type) {
    scheduleSource = { body: item.body, image_url: item.image_url, slides: item.slides, video_url: item.video_url, hashtags: item.hashtags ?? [] };
  } else {
    const { data: rendition } = await db
      .from('kefy_content_renditions')
      .select('body, image_url, slides, video_url, hashtags, status')
      .eq('content_item_id', item.id)
      .eq('format', format)
      .maybeSingle();
    if (!rendition || rendition.status !== 'ready') {
      return NextResponse.json({ error: `The ${format} version of this content hasn't been generated yet` }, { status: 422 });
    }
    scheduleSource = rendition;
  }

  if (!scheduleSource.body) return NextResponse.json({ error: 'Content has no body text' }, { status: 422 });

  // Fetch all requested active accounts belonging to this org
  const { data: accounts } = await db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, status, platform')
    .in('id', accountIds)
    .eq('org_id', auth.orgId)
    .eq('status', 'active');

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ error: 'No active social accounts found for the given IDs' }, { status: 404 });
  }

  const { publishPost } = await import('@/lib/zernio');

  console.log(
    `[schedule] START itemId=${item.id} format=${format}` +
    ` scheduledAt=${scheduledAt.toISOString()} accounts=[${accounts.map((a) => `${a.id}(${a.platform})`).join(', ')}]`,
  );

  const results: Array<{
    social_account_id: string;
    platform: string;
    status: 'scheduled' | 'failed';
    post_id?: string;
    scheduled_post_id?: string;
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      const slides = scheduleSource.slides as Array<{ image_url?: string }> | null;
      const mediaUrls: string[] | undefined =
        format === 'carousel' && Array.isArray(slides)
          ? slides.map((s) => s.image_url).filter((u): u is string => !!u)
          : undefined;

      // Same video/hashtag rules as immediate publish — see /api/social/publish
      const isVideoFormat = (format === 'reel' || format === 'story') && !!scheduleSource.video_url;
      const videoUrl: string | undefined = isVideoFormat ? (scheduleSource.video_url ?? undefined) : undefined;
      const publishImageUrl = isVideoFormat ? undefined : (scheduleSource.image_url ?? undefined);
      const hashtags = scheduleSource.hashtags ?? [];
      let publishText = scheduleSource.body;
      if (isVideoFormat && hashtags.length > 0) {
        const hashtagLine = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
        publishText = `${scheduleSource.body}\n\n${hashtagLine}`;
      }

      console.log(
        `[schedule] → account ${account.id} platform=${account.platform}` +
        ` zernio_account_id=${account.zernio_account_id}` +
        ` scheduledAt=${scheduledAt.toISOString()}`,
      );

      const zernioResult = await publishPost({
        account_id:   account.zernio_account_id!,
        platform:     account.platform,
        text:         publishText!,
        image_url:    publishImageUrl,
        media_urls:   mediaUrls,
        video_url:    videoUrl,
        content_type: format,
        hashtags:     isVideoFormat ? [] : hashtags,
        scheduled_at: scheduledAt.toISOString(),
      });

      console.log(
        `[schedule] ✓ account ${account.id} zernio_post_id=${zernioResult.post_id}` +
        ` status=${zernioResult.status} scheduledAt=${zernioResult.scheduled_at}`,
      );

      const { data: post, error: dbError } = await db
        .from('kefy_scheduled_posts')
        .insert({
          org_id:            auth.orgId,
          content_item_id:   item.id,
          social_account_id: account.id,
          scheduled_at:      scheduledAt.toISOString(),
          zernio_post_id:    zernioResult.post_id,
          status:            'scheduled',
          format,
          created_by:        auth.userId,
        })
        .select('id')
        .single();

      if (dbError) console.error('schedule insert error:', dbError.message);

      results.push({
        social_account_id: account.id,
        platform:          account.platform,
        status:            'scheduled',
        post_id:           zernioResult.post_id,
        scheduled_post_id: post?.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Zernio scheduling failed';
      console.error(`[schedule] ✗ account ${account.id} platform=${account.platform} error:`, msg);
      if (err instanceof Error && err.stack) console.error('[schedule] stack:', err.stack);
      results.push({ social_account_id: account.id, platform: account.platform, status: 'failed', error: msg });
    }
  }

  const allFailed = results.every((r) => r.status === 'failed');
  const httpStatus = allFailed ? 502 : 201;

  if (!allFailed) {
    await db
      .from('kefy_content_items')
      .update({ status: 'scheduled' })
      .eq('id', item.id);
  }

  return NextResponse.json({ results }, { status: httpStatus });
}
