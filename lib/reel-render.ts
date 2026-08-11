// lib/reel-render.ts
// Reconciliation of Remotion Lambda renders.
//
// A render is triggered from POST /api/content/reel/render, which returns 202
// immediately. Persisting the resulting S3 URL used to happen *only* while the
// browser polled the GET endpoint, so closing the tab left the row stuck at
// render_status='rendering' with video_url=null forever — and there was no way
// back, because the client never re-triggers a render for a row that claims to
// be rendering.
//
// This module owns the "what is the real state of this render" decision so both
// the polling endpoint and the cron (/api/content/reel/reconcile) share it.

import { getRenderProgress } from '@remotion/lambda/client';

/** A render whose trigger never recorded a renderId within this window is lost. */
export const RENDER_TRIGGER_GRACE_MS = 3 * 60 * 1000;   // 3 min
/** A render still not finished after this is considered dead (Lambda timeout is 240 s). */
export const RENDER_STALE_MS         = 20 * 60 * 1000;  // 20 min

export type RenderTable = 'kefy_content_items' | 'kefy_content_renditions';

export interface RenderTarget {
  table:         RenderTable;
  id:            string;
  metadata:      Record<string, unknown>;
  videoUrl:      string | null;
  renderStatus:  string | null;
}

export type RenderOutcome =
  | { status: 'ready';        video_url: string }
  | { status: 'rendering';    progress: number }
  | { status: 'not_rendered'; reason: string; error?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/** How long this render has been running, or null when we never stamped a start. */
function elapsedMs(metadata: Record<string, unknown>, now: number): number | null {
  const startedAt = str(metadata.lambda_started_at);
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  return Number.isNaN(t) ? null : now - t;
}

/**
 * Resolve the true state of a target that claims to be rendering, persisting
 * the result. Safe to call from anywhere (polling, cron, publish-time checks).
 *
 * Rows are only ever moved *out* of 'rendering' — to 'ready' with the S3 URL,
 * or back to 'not_rendered' so the next render can be triggered cleanly.
 */
export async function reconcileRenderTarget(
  db: Db,
  target: RenderTarget,
  now: number = Date.now(),
): Promise<RenderOutcome> {
  if (target.videoUrl) return { status: 'ready', video_url: target.videoUrl };

  const renderId   = str(target.metadata.lambda_render_id);
  const bucketName = str(target.metadata.lambda_bucket);
  const elapsed    = elapsedMs(target.metadata, now);

  // ── The trigger died before recording a renderId ──────────────────────────
  if (!renderId || !bucketName) {
    // Still inside the grace window: the POST may just not have written the
    // metadata yet (it does so right after Lambda returns the renderId).
    if (elapsed !== null && elapsed < RENDER_TRIGGER_GRACE_MS) {
      return { status: 'rendering', progress: 0 };
    }
    await markNotRendered(db, target);
    return { status: 'not_rendered', reason: 'trigger_lost' };
  }

  try {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: getEnv('REMOTION_LAMBDA_FUNCTION_NAME'),
      region:       getEnv('REMOTION_AWS_REGION') as Parameters<typeof getRenderProgress>[0]['region'],
    });

    if (progress.fatalErrorEncountered) {
      const error = progress.errors?.[0]?.message ?? 'Lambda render failed';
      await markNotRendered(db, target);
      return { status: 'not_rendered', reason: 'render_failed', error };
    }

    if (progress.done && progress.outputFile) {
      await db.from(target.table)
        .update({ video_url: progress.outputFile, render_status: 'ready' })
        .eq('id', target.id);
      console.log(`[reel-render] ${target.table}/${target.id} ready — video_url=${progress.outputFile}`);
      return { status: 'ready', video_url: progress.outputFile };
    }

    // Running for far longer than any legitimate render — give the user a retry.
    if (elapsed !== null && elapsed > RENDER_STALE_MS) {
      await markNotRendered(db, target);
      return { status: 'not_rendered', reason: 'stale' };
    }

    return { status: 'rendering', progress: progress.overallProgress ?? 0 };
  } catch (err) {
    // Lambda/S3 unreachable, or Remotion already cleaned up the render record.
    console.error(`[reel-render] progress lookup failed for ${target.table}/${target.id}:`, err);
    if (elapsed !== null && elapsed > RENDER_STALE_MS) {
      await markNotRendered(db, target);
      return { status: 'not_rendered', reason: 'stale' };
    }
    return { status: 'rendering', progress: 0 };
  }
}

/** Reset to a clean, retriable state and drop the dead Lambda pointers. */
async function markNotRendered(db: Db, target: RenderTarget): Promise<void> {
  const metadata = { ...target.metadata };
  delete metadata.lambda_render_id;
  delete metadata.lambda_bucket;
  delete metadata.lambda_started_at;

  await db.from(target.table)
    .update({ render_status: 'not_rendered', metadata })
    .eq('id', target.id);
}
