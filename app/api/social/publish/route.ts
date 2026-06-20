import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { resizeForPlatform } from '@/lib/image-processor';
import { uploadBase64Image } from '@/lib/storage';
import type { ContentChannel } from '@/types/ai';

// ─── POST /api/social/publish ─────────────────────────────────────────────────
// Publish a content item immediately to one or more social accounts.
//
// Body:
//   content_item_id     — required
//   social_account_ids  — required (array of account IDs)

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
  if (!Array.isArray(input.social_account_ids) || input.social_account_ids.length === 0) {
    return NextResponse.json({ error: 'social_account_ids must be a non-empty array' }, { status: 422 });
  }

  const accountIds = (input.social_account_ids as unknown[]).filter(
    (id): id is string => typeof id === 'string',
  );
  if (accountIds.length === 0) {
    return NextResponse.json({ error: 'social_account_ids must contain valid IDs' }, { status: 422 });
  }

  const db = createSupabaseServer();

  // Verify content item
  const { data: item } = await db
    .from('kefy_content_items')
    .select('id, body, image_url, hashtags, channel, content_type, slides')
    .eq('id', input.content_item_id)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  if (!item.body) return NextResponse.json({ error: 'Content item has no body text' }, { status: 422 });

  // Fetch requested accounts (only active + belonging to this org)
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
    `[publish] START itemId=${item.id} contentType=${item.content_type} accounts=[${accounts.map((a) => `${a.id}(${a.platform})`).join(', ')}]`,
  );

  // Pre-download source image once (if any) so we can resize per platform
  let sourceImageBuffer: Buffer | null = null;
  if (item.image_url) {
    try {
      const resp = await fetch(item.image_url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        sourceImageBuffer = Buffer.from(ab);
      }
    } catch {
      console.warn('Could not fetch source image for resize, using original URL');
    }
  }

  const results: Array<{
    social_account_id: string;
    platform: string;
    status: 'published' | 'failed';
    zernio_post_id?: string;
    error?: string;
  }> = [];

  // Publish to each account independently — don't abort on partial failure
  for (const account of accounts) {
    try {
      // Resize image to the platform's canonical dimensions
      let platformImageUrl = item.image_url ?? undefined;
      if (sourceImageBuffer) {
        try {
          const resizedBuf = await resizeForPlatform(
            sourceImageBuffer,
            (account.platform ?? 'generic') as ContentChannel,
          );
          const b64 = resizedBuf.toString('base64');
          platformImageUrl = await uploadBase64Image(
            b64,
            auth.orgId,
            `publish-${account.platform}-${Date.now()}.jpeg`,
          );
        } catch (resizeErr) {
          console.warn(`Resize failed for ${account.platform}, using original:`, resizeErr);
        }
      }

      const contentType = (item.content_type ?? 'post') as 'post' | 'carousel' | 'reel';
      const slides = item.slides as Array<{ image_url?: string }> | null;
      const mediaUrls: string[] | undefined =
        contentType === 'carousel' && Array.isArray(slides)
          ? slides.map((s) => s.image_url).filter((u): u is string => !!u)
          : undefined;

      console.log(
        `[publish] → account ${account.id} platform=${account.platform}` +
        ` zernio_account_id=${account.zernio_account_id}` +
        ` hasImage=${!!platformImageUrl} mediaUrls=${mediaUrls?.length ?? 0}`,
      );

      const zernioResult = await publishPost({
        account_id:   account.zernio_account_id!,
        platform:     account.platform,
        text:         item.body,
        image_url:    platformImageUrl,
        media_urls:   mediaUrls,
        content_type: contentType,
        hashtags:     item.hashtags ?? [],
        // No scheduled_at → immediate
      });

      console.log(
        `[publish] ✓ account ${account.id} zernio_post_id=${zernioResult.post_id}` +
        ` status=${zernioResult.status} platform_post_id=${zernioResult.platform_post_id}`,
      );

      await db.from('kefy_scheduled_posts').insert({
        org_id:             auth.orgId,
        content_item_id:    item.id,
        social_account_id:  account.id,
        zernio_post_id:     zernioResult.post_id,
        platform_post_id:   zernioResult.platform_post_id ?? null,
        published_at:       new Date().toISOString(),
        status:             'published',
        created_by:         auth.userId,
      });

      results.push({
        social_account_id: account.id,
        platform:          account.platform,
        status:            'published',
        zernio_post_id:    zernioResult.post_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      console.error(`[publish] ✗ account ${account.id} platform=${account.platform} error:`, msg);
      if (err instanceof Error && err.stack) console.error('[publish] stack:', err.stack);

      await db.from('kefy_scheduled_posts').insert({
        org_id:            auth.orgId,
        content_item_id:   item.id,
        social_account_id: account.id,
        status:            'failed',
        error_message:     msg,
        created_by:        auth.userId,
      });

      results.push({
        social_account_id: account.id,
        platform:          account.platform,
        status:            'failed',
        error:             msg,
      });
    }
  }

  // Update content item status based on overall result
  const allFailed    = results.every((r) => r.status === 'failed');
  const anyPublished = results.some((r)  => r.status === 'published');

  await db
    .from('kefy_content_items')
    .update({ status: allFailed ? 'approved' : 'published' })
    .eq('id', item.id);

  const httpStatus = allFailed ? 502 : anyPublished ? 200 : 207;
  return NextResponse.json({ results }, { status: httpStatus });
}
