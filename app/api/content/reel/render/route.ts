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

// ─── GET /api/content/reel/render?itemId=X ────────────────────────────────────
// Poll Lambda render progress. When done, saves the S3 URL as video_url.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const db = createSupabaseServer();
  const { data: item, error } = await db
    .from('kefy_content_items')
    .select('id, render_status, video_url, metadata')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .single();

  if (error || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Already done — return immediately
  if (item.render_status === 'ready' && item.video_url) {
    return NextResponse.json({ render_status: 'ready', video_url: item.video_url });
  }

  if (item.render_status === 'rendering') {
    const meta       = (item.metadata ?? {}) as Record<string, unknown>;
    const renderId   = typeof meta.lambda_render_id === 'string' ? meta.lambda_render_id : null;
    const bucketName = typeof meta.lambda_bucket    === 'string' ? meta.lambda_bucket    : null;

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
          await db.from('kefy_content_items').update({ render_status: 'not_rendered' }).eq('id', itemId);
          return NextResponse.json({ render_status: 'error', error: errMsg });
        }

        if (progress.done && progress.outputFile) {
          // Save the public S3 URL directly — no Mux upload needed
          await db.from('kefy_content_items').update({
            video_url:     progress.outputFile,
            render_status: 'ready',
          }).eq('id', itemId);

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
    render_status: item.render_status,
    video_url:     item.video_url ?? null,
  });
}

// ─── POST /api/content/reel/render ────────────────────────────────────────────
// Trigger a Remotion Lambda render. Returns 202 immediately; client polls GET.
//
// Body: { itemId: string }
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
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 422 });

  const db = createSupabaseServer();

  // ── Fetch content item ──────────────────────────────────────────────────────
  const { data: item, error: fetchError } = await db
    .from('kefy_content_items')
    .select('id, content_type, slides, title, metadata, mux_playback_id, video_url')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }
  if (item.content_type !== 'reel') {
    return NextResponse.json({ error: 'Only reel items can be rendered' }, { status: 422 });
  }

  // Already rendered — return existing video URL immediately
  if (item.video_url) {
    return NextResponse.json({ video_url: item.video_url, render_status: 'ready' });
  }
  // Backward compat: old items rendered via Mux
  if (item.mux_playback_id) {
    return NextResponse.json({ mux_playback_id: item.mux_playback_id, render_status: 'ready' });
  }
  if (!Array.isArray(item.slides) || item.slides.length === 0) {
    return NextResponse.json({ error: 'No scenes found in reel' }, { status: 422 });
  }

  // ── Fetch brand kit for composition props ───────────────────────────────────
  const { data: brand } = await db
    .from('kefy_brand_kits')
    .select('name, accent_color, primary_color, font_heading, logo_url')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  // ── Mark as rendering ────────────────────────────────────────────────────────
  await db
    .from('kefy_content_items')
    .update({ render_status: 'rendering' })
    .eq('id', itemId);

  try {
    const region       = getEnv('REMOTION_AWS_REGION') as AwsRegion;
    const functionName = getEnv('REMOTION_LAMBDA_FUNCTION_NAME');
    const serveUrl     = getEnv('REMOTION_SERVE_URL');

    const inputProps = {
      scenes:       item.slides,
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
    const existingMeta = (item.metadata ?? {}) as Record<string, unknown>;
    await db.from('kefy_content_items').update({
      metadata: {
        ...existingMeta,
        lambda_render_id: renderId,
        lambda_bucket:    bucketName,
      },
    }).eq('id', itemId);

    console.log(`[reel/render POST] Lambda render started — renderId=${renderId}`);

    return NextResponse.json(
      { message: 'Render iniciado. Usa GET /api/content/reel/render?itemId= para verificar el progreso.', renderId },
      { status: 202 },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Render failed';
    console.error('[reel/render POST] error:', msg);

    await db
      .from('kefy_content_items')
      .update({ render_status: 'error' })
      .eq('id', itemId);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
