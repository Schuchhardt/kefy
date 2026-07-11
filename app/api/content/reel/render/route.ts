import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import {
  renderMediaOnLambda,
  getRenderProgress,
  type RenderProgress,
} from '@remotion/lambda/client';

export const runtime     = 'nodejs';
// Lambda renders async — 60 s is enough to trigger + return 202
export const maxDuration = 60;

// ─── Env helper ───────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

type AwsRegion = Parameters<typeof renderMediaOnLambda>[0]['region'];

// ─── Render target resolution ──────────────────────────────────────────────────
// A render can target the content item itself (its primary format) or one of
// its alternate-format renditions (kefy_content_renditions) — e.g. rendering
// a "reel" or "story" version of an item whose primary format is "post".
// Both tables share the same render-relevant columns, so the rest of this
// file operates on a `RenderTarget` without caring which table it came from.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface RenderTarget {
  table:         'kefy_content_items' | 'kefy_content_renditions';
  id:            string;
  slides:        unknown;
  metadata:      Record<string, unknown>;
  videoUrl:      string | null;
  muxPlaybackId: string | null;
  renderStatus:  string | null;
}

async function resolveTarget(db: Db, itemId: string, orgId: string, format: string | null): Promise<
  { target: RenderTarget; itemContentType: string } | null
> {
  const { data: item } = await db
    .from('kefy_content_items')
    .select('id, content_type, slides, metadata, mux_playback_id, video_url, render_status')
    .eq('id', itemId)
    .eq('org_id', orgId)
    .single();

  if (!item) return null;

  const effectiveFormat = format || item.content_type;

  if (effectiveFormat === item.content_type) {
    return {
      itemContentType: item.content_type,
      target: {
        table:         'kefy_content_items',
        id:            item.id,
        slides:        item.slides,
        metadata:      (item.metadata ?? {}) as Record<string, unknown>,
        videoUrl:      item.video_url ?? null,
        muxPlaybackId: item.mux_playback_id ?? null,
        renderStatus:  item.render_status ?? null,
      },
    };
  }

  const { data: rendition } = await db
    .from('kefy_content_renditions')
    .select('id, slides, metadata, mux_playback_id, video_url, render_status')
    .eq('content_item_id', itemId)
    .eq('format', effectiveFormat)
    .maybeSingle();

  if (!rendition) return null;

  return {
    itemContentType: item.content_type,
    target: {
      table:         'kefy_content_renditions',
      id:            rendition.id,
      slides:        rendition.slides,
      metadata:      (rendition.metadata ?? {}) as Record<string, unknown>,
      videoUrl:      rendition.video_url ?? null,
      muxPlaybackId: rendition.mux_playback_id ?? null,
      renderStatus:  rendition.render_status ?? null,
    },
  };
}

// ─── GET /api/content/reel/render?itemId=X&format=reel|story ─────────────────
// Poll Lambda render progress. When done, saves the S3 URL as video_url on
// whichever row (item or rendition) is the render target.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const itemId = req.nextUrl.searchParams.get('itemId');
  const format = req.nextUrl.searchParams.get('format');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const db = createSupabaseServer();
  const resolved = await resolveTarget(db, itemId, auth.orgId, format);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { target } = resolved;

  // Already done — return immediately
  if (target.renderStatus === 'ready' && target.videoUrl) {
    return NextResponse.json({ render_status: 'ready', video_url: target.videoUrl });
  }

  if (target.renderStatus === 'rendering') {
    const renderId   = typeof target.metadata.lambda_render_id === 'string' ? target.metadata.lambda_render_id : null;
    const bucketName = typeof target.metadata.lambda_bucket    === 'string' ? target.metadata.lambda_bucket    : null;

    // ── Poll Lambda progress ──────────────────────────────────────────────────
    if (renderId && bucketName) {
      try {
        const region       = getEnv('REMOTION_AWS_REGION') as AwsRegion;
        const functionName = getEnv('REMOTION_LAMBDA_FUNCTION_NAME');

        const progress: RenderProgress = await getRenderProgress({
          renderId,
          bucketName,
          functionName,
          region,
        });

        if (progress.fatalErrorEncountered) {
          const errMsg = progress.errors?.[0]?.message ?? 'Lambda render failed';
          // Reset to not_rendered so the client can retry cleanly
          await db.from(target.table).update({ render_status: 'not_rendered' }).eq('id', target.id);
          return NextResponse.json({ render_status: 'error', error: errMsg });
        }

        if (progress.done && progress.outputFile) {
          // Save the public S3 URL directly — no Mux upload needed
          await db.from(target.table).update({
            video_url:     progress.outputFile,
            render_status: 'ready',
          }).eq('id', target.id);

          console.log(`[reel/render GET] Done — video_url=${progress.outputFile}`);

          return NextResponse.json({
            render_status: 'ready',
            video_url:     progress.outputFile,
          });
        }

        return NextResponse.json({
          render_status: 'rendering',
          progress:      progress.overallProgress ?? 0,
        });
      } catch (err) {
        console.error('[reel/render GET] Lambda poll error:', err);
        // Fall through to return current DB status
      }
    }
  }

  return NextResponse.json({
    render_status: target.renderStatus,
    video_url:     target.videoUrl ?? null,
  });
}

// ─── POST /api/content/reel/render ────────────────────────────────────────────
// Trigger a Remotion Lambda render. Returns 202 immediately; client polls GET.
//
// Body: { itemId: string, format?: 'reel' | 'story' }
//   format defaults to the item's own content_type (backward compatible).
//   When it differs, the render targets that item's alternate-format
//   rendition (kefy_content_renditions) instead of the item itself.
//
// Required env vars (set in Vercel + .env.local):
//   REMOTION_AWS_REGION, REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY
//   REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_SERVE_URL
//
// One-time setup: npx tsx scripts/deploy-remotion-lambda.ts

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const input  = body as Record<string, unknown>;
  const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : null;
  const format = typeof input.format === 'string' ? input.format.trim() : null;
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 422 });

  const db = createSupabaseServer();

  const resolved = await resolveTarget(db, itemId, auth.orgId, format);
  if (!resolved) return NextResponse.json({ error: 'Content item or rendition not found' }, { status: 404 });
  const { target } = resolved;
  const effectiveFormat = format || resolved.itemContentType;

  if (effectiveFormat !== 'reel' && effectiveFormat !== 'story') {
    return NextResponse.json({ error: 'Only reel or story items can be rendered' }, { status: 422 });
  }

  // Already rendered — return existing video URL immediately
  if (target.videoUrl) {
    return NextResponse.json({ video_url: target.videoUrl, render_status: 'ready' });
  }
  // Backward compat: old items rendered via Mux
  if (target.muxPlaybackId) {
    return NextResponse.json({ mux_playback_id: target.muxPlaybackId, render_status: 'ready' });
  }
  if (!Array.isArray(target.slides) || target.slides.length === 0) {
    return NextResponse.json({ error: 'No scenes found to render' }, { status: 422 });
  }

  // ── Fetch brand kit for composition props ───────────────────────────────────
  const { data: brand } = await db
    .from('kefy_brand_kits')
    .select('name, accent_color, primary_color, font_heading, logo_url')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // ── Mark as rendering ────────────────────────────────────────────────────────
  await db
    .from(target.table)
    .update({ render_status: 'rendering' })
    .eq('id', target.id);

  try {
    const region       = getEnv('REMOTION_AWS_REGION') as AwsRegion;
    const functionName = getEnv('REMOTION_LAMBDA_FUNCTION_NAME');
    const serveUrl      = getEnv('REMOTION_SERVE_URL');

    const inputProps = {
      scenes:       target.slides,
      brandName:    brand?.name          ?? undefined,
      accentColor:  brand?.accent_color  ?? '#c6ff4b',
      primaryColor: brand?.primary_color ?? undefined,
      fontHeading:  brand?.font_heading  ?? undefined,
      logoUrl:      brand?.logo_url      ?? undefined,
    };

    // Trigger Lambda render — returns immediately with a renderId
    const { renderId, bucketName } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: 'KefyReel',
      inputProps,
      codec:       'h264',
      imageFormat: 'jpeg',
      jpegQuality: 85,
      // Render more frames per invocation → fewer parallel Lambdas → avoids concurrency limit
      framesPerLambda: 120,
      downloadBehavior: { type: 'play-in-browser' },
    });

    // Persist renderId + bucket so the GET endpoint can poll progress
    await db.from(target.table).update({
      metadata: {
        ...target.metadata,
        lambda_render_id: renderId,
        lambda_bucket:    bucketName,
      },
    }).eq('id', target.id);

    console.log(`[reel/render POST] Lambda render started — renderId=${renderId}`);

    return NextResponse.json(
      { message: 'Render iniciado. Usa GET /api/content/reel/render?itemId= para verificar el progreso.', renderId },
      { status: 202 },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Render failed';
    console.error('[reel/render POST] error:', msg);

    await db
      .from(target.table)
      .update({ render_status: 'error' })
      .eq('id', target.id);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
