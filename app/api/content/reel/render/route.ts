import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { createMuxDirectUpload, getMuxUploadStatus } from '@/lib/mux';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── GET /api/content/reel/render?itemId=X ────────────────────────────────────
// Poll the render/Mux status of a content item.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const db = createSupabaseServer();
  const { data: item, error } = await db
    .from('kefy_content_items')
    .select('id, render_status, mux_asset_id, mux_playback_id')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .single();

  if (error || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If rendering is in progress and we have an upload_id in metadata, check Mux
  if (item.render_status === 'rendering' && item.mux_asset_id?.startsWith('upload_')) {
    try {
      const status = await getMuxUploadStatus(item.mux_asset_id);
      if (status.status === 'ready' && status.playbackId) {
        await db
          .from('kefy_content_items')
          .update({
            mux_asset_id:    status.assetId,
            mux_playback_id: status.playbackId,
            render_status:   'ready',
          })
          .eq('id', itemId);

        return NextResponse.json({
          render_status:   'ready',
          mux_asset_id:    status.assetId,
          mux_playback_id: status.playbackId,
        });
      } else if (status.status === 'errored') {
        await db
          .from('kefy_content_items')
          .update({ render_status: 'error' })
          .eq('id', itemId);
        return NextResponse.json({ render_status: 'error' });
      }
    } catch {
      // Non-critical — return current DB status
    }
  }

  return NextResponse.json({
    render_status:   item.render_status,
    mux_asset_id:    item.mux_asset_id,
    mux_playback_id: item.mux_playback_id,
  });
}

// ─── POST /api/content/reel/render ────────────────────────────────────────────
// Render the reel composition to MP4 with @remotion/renderer, upload to Mux.
//
// Body: { itemId: string }
//
// Deployment (Vercel): maxDuration=300 (5 min) configured via the top-level
// `maxDuration` export and `vercel.json`. Pro plan or higher required.
// For production scale, consider migrating to Remotion Lambda.

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
    .select('id, content_type, slides, title')
    .eq('id', itemId)
    .eq('org_id', auth.orgId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }
  if (item.content_type !== 'reel') {
    return NextResponse.json({ error: 'Only reel items can be rendered' }, { status: 422 });
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
    // ── Dynamically import renderer (heavy — server only) ─────────────────────
    const { bundle }        = await import('@remotion/bundler');
    const { renderMedia, getCompositions } = await import('@remotion/renderer');

    const entryPoint = path.join(process.cwd(), 'remotion', 'Root.tsx');
    const outputPath = path.join(os.tmpdir(), `reel-${itemId}-${Date.now()}.mp4`);

    // Bundle the composition (webpack build of remotion/ directory)
    const bundleUrl = await bundle({ entryPoint, onProgress: () => {} });

    // Get composition metadata
    const compositions = await getCompositions(bundleUrl, {
      inputProps: { scenes: item.slides },
    });
    const composition = compositions.find((c) => c.id === 'KefyReel');
    if (!composition) throw new Error('KefyReel composition not found in bundle');

    const inputProps = {
      scenes:       item.slides,
      brandName:    brand?.name         ?? undefined,
      accentColor:  brand?.accent_color ?? '#c6ff4b',
      primaryColor: brand?.primary_color ?? undefined,
      fontHeading:  brand?.font_heading  ?? undefined,
      logoUrl:      brand?.logo_url      ?? undefined,
    };

    // Render to MP4 using H.264 at 1080×1920 (9:16 portrait)
    await renderMedia({
      serveUrl:    bundleUrl,
      composition: { ...composition, ...inputProps },
      inputProps,
      codec:          'h264',
      outputLocation: outputPath,
      imageFormat:    'jpeg',
      jpegQuality:    85,
      onProgress:     () => {},
    });

    // ── Read the rendered file ─────────────────────────────────────────────────
    const videoBuffer = fs.readFileSync(outputPath);

    // ── Create Mux Direct Upload ──────────────────────────────────────────────
    const muxUpload = await createMuxDirectUpload();

    // ── PUT video to Mux GCS URL ──────────────────────────────────────────────
    const putRes = await fetch(muxUpload.uploadUrl, {
      method:  'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body:    videoBuffer,
    });
    if (!putRes.ok) throw new Error(`Mux upload failed: ${putRes.status} ${putRes.statusText}`);

    // ── Clean up temp file ────────────────────────────────────────────────────
    try { fs.unlinkSync(outputPath); } catch { /* non-critical */ }

    // ── Poll Mux for asset readiness (up to 4 minutes) ───────────────────────
    let muxStatus = await getMuxUploadStatus(muxUpload.uploadId);
    const deadline = Date.now() + 240_000;  // 4 minute timeout

    while (muxStatus.status !== 'ready' && muxStatus.status !== 'errored' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      muxStatus = await getMuxUploadStatus(muxUpload.uploadId);
    }

    if (muxStatus.status === 'errored' || !muxStatus.playbackId) {
      // Save upload_id so polling endpoint can check later
      await db.from('kefy_content_items').update({
        mux_asset_id:  `upload_${muxUpload.uploadId}`,
        render_status: 'rendering',
      }).eq('id', itemId);

      return NextResponse.json({
        message:   'Video en proceso. Usa GET /api/content/reel/render?itemId= para verificar.',
        upload_id: muxUpload.uploadId,
      }, { status: 202 });
    }

    // ── Save Mux data to DB ───────────────────────────────────────────────────
    await db.from('kefy_content_items').update({
      mux_asset_id:    muxStatus.assetId,
      mux_playback_id: muxStatus.playbackId,
      render_status:   'ready',
    }).eq('id', itemId);

    return NextResponse.json({
      mux_asset_id:    muxStatus.assetId,
      mux_playback_id: muxStatus.playbackId,
      thumbnail_url:   `https://image.mux.com/${muxStatus.playbackId}/thumbnail.jpg`,
      gif_url:         `https://image.mux.com/${muxStatus.playbackId}/animated.gif`,
    }, { status: 200 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Render failed';
    console.error('reel/render error:', msg);

    await db
      .from('kefy_content_items')
      .update({ render_status: 'error' })
      .eq('id', itemId);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
