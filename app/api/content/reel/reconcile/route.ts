import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { reconcileRenderTarget, type RenderTable, type RenderTarget } from '@/lib/reel-render';
import { advanceVideoJob } from '@/lib/video/engine';
import { reportError } from '@/lib/observability';

export const runtime     = 'nodejs';
export const maxDuration = 300;

// ─── /api/content/reel/reconcile ──────────────────────────────────────────────
// Finishes Remotion Lambda renders whose browser never came back.
//
// The render itself is async: POST /api/content/reel/render triggers Lambda and
// the S3 URL is written when someone polls for progress. If the user closes the
// tab mid-render, nothing ever writes it — the row stays 'rendering' with
// video_url=null and the reel becomes unpublishable. This job sweeps those rows
// and moves them to 'ready' (with the video) or back to 'not_rendered' (so the
// next render can be triggered).
//
// Invocation modes:
//   - GET  (Vercel Cron): header `Authorization: Bearer ${CRON_SECRET}`
//   - POST (manual): authenticated owner/admin — only their own org's rows
//
// It also advances the video pipeline (lib/video/engine.ts): every running
// production gets one engine pass, so a video keeps progressing — images,
// animations, lip-sync, final edit — even if nobody has the player open.
// Rows that belong to a production (metadata.video_job_id) are left to the
// engine: they have no Lambda pointers and the plain reconciler would reset
// them as 'trigger_lost'.

/** Cap per run so one sweep can't exceed the function's time budget. */
const MAX_TARGETS_PER_RUN = 25;
/** Video productions advanced per run. They go two at a time (each may run up
 *  to 6 image generations in parallel — more would hit OpenAI rate limits),
 *  and no new one starts after RUN_BUDGET_MS so a pass plus its longest sync
 *  step (~90 s) fits in maxDuration. */
const MAX_JOBS_PER_RUN   = 8;
const JOBS_IN_PARALLEL   = 2;
const JOB_BUDGET_MS      = 20 * 1000;
const RUN_BUDGET_MS      = 150 * 1000;

function isVercelCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.AUTOPILOT_CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

interface Row {
  id:            string;
  metadata:      Record<string, unknown> | null;
  video_url:     string | null;
  render_status: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function fetchRendering(db: Db, table: RenderTable, orgId: string | null, limit: number): Promise<RenderTarget[]> {
  let query = db
    .from(table)
    .select(table === 'kefy_content_items'
      ? 'id, metadata, video_url, render_status, org_id'
      : 'id, metadata, video_url, render_status')
    .eq('render_status', 'rendering')
    // Las piezas del pipeline de video las avanza su trabajo (más abajo). Se
    // filtran aquí y no después del límite: si no, 25 piezas del pipeline en
    // curso dejaban sin reconciliar los renders directos.
    .is('metadata->>video_job_id', null)
    .limit(limit);

  // Renditions have no org_id column — they are scoped through their item, and
  // the cron sweeps everything anyway, so org filtering only applies to items.
  if (orgId && table === 'kefy_content_items') query = query.eq('org_id', orgId);

  const { data } = await query;
  return ((data ?? []) as Row[]).filter((row) => !row.metadata?.video_job_id).map((row) => ({
    table,
    id:           row.id,
    metadata:     row.metadata ?? {},
    videoUrl:     row.video_url,
    renderStatus: row.render_status,
  }));
}

async function runReconcile(orgId: string | null) {
  const db = createSupabaseServer();

  const items      = await fetchRendering(db, 'kefy_content_items', orgId, MAX_TARGETS_PER_RUN);
  const renditions = orgId
    ? []  // manual runs only sweep the caller's own items
    : await fetchRendering(db, 'kefy_content_renditions', null, MAX_TARGETS_PER_RUN);

  const targets = [...items, ...renditions].slice(0, MAX_TARGETS_PER_RUN);

  console.log(`[reel/reconcile] sweeping ${targets.length} rendering row(s)`);

  const results = [];
  for (const target of targets) {
    try {
      const outcome = await reconcileRenderTarget(db, target);
      results.push({ table: target.table, id: target.id, ...outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'reconcile failed';
      console.error(`[reel/reconcile] ${target.table}/${target.id}:`, message);
      results.push({ table: target.table, id: target.id, status: 'error' as const, error: message });
    }
  }

  // ── Video pipeline ─────────────────────────────────────────────────────────
  let jobsQuery = db
    .from('kefy_video_jobs')
    .select('id')
    .eq('status', 'running')
    .order('advanced_at', { ascending: true, nullsFirst: true })
    .limit(MAX_JOBS_PER_RUN);
  if (orgId) jobsQuery = jobsQuery.eq('org_id', orgId);
  const { data: jobs } = await jobsQuery;

  const startedAt = Date.now();
  const queue = [...((jobs ?? []) as Array<{ id: string }>)];
  const productions: Array<{ id: string; status: string; error?: string }> = [];
  while (queue.length && Date.now() - startedAt < RUN_BUDGET_MS) {
    const batch = queue.splice(0, JOBS_IN_PARALLEL);
    productions.push(...await Promise.all(batch.map(async (job) => {
      try {
        const snap = await advanceVideoJob(db, job.id, { budgetMs: JOB_BUDGET_MS });
        return { id: job.id, status: snap?.status ?? 'missing' };
      } catch (err) {
        reportError(err, { route: 'reel/reconcile', extra: { videoJobId: job.id } });
        return { id: job.id, status: 'error', error: err instanceof Error ? err.message : 'advance failed' };
      }
    })));
  }

  const summary = {
    productions:  productions.length,
    swept:        results.length,
    ready:        results.filter((r) => r.status === 'ready').length,
    rendering:    results.filter((r) => r.status === 'rendering').length,
    not_rendered: results.filter((r) => r.status === 'not_rendered').length,
    errors:       results.filter((r) => r.status === 'error').length,
  };
  console.log('[reel/reconcile] done:', JSON.stringify(summary));

  return NextResponse.json({ ...summary, results, video_jobs: productions });
}

export async function GET(req: NextRequest) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runReconcile(null);
}

export async function POST(req: NextRequest) {
  if (isVercelCronAuthorized(req)) return runReconcile(null);

  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return runReconcile(auth.orgId);
}
