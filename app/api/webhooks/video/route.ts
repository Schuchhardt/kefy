import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { advanceVideoJob, verifyStepSignature } from '@/lib/video/engine';

export const runtime     = 'nodejs';
export const maxDuration = 120;

// ─── POST /api/webhooks/video?step=&sig= ───────────────────────────────
// Higgsfield or fal.ai calls this when an animation or lip-sync finishes (the
// engine passes the URL as `hf_webhook` / `fal_webhook` when it queues the job). Without it, the next step
// would wait for the player's poll or the 5-minute cron.
//
// The body is not trusted: the signature (HMAC of the step id, see
// lib/video/engine.ts::signStep) only proves the URL came from us, so the
// handler just runs an engine pass — which asks fal for the real result
// itself — instead of reading the result from the payload.
// Higgsfield may deliver more than once; each delivery is just another pass.
//
// Always answers 200 for a valid signature: fal retries non-2xx responses,
// and a retry would only run the same pass again.

export async function POST(req: NextRequest) {
  const stepId = req.nextUrl.searchParams.get('step') ?? '';
  const sig    = req.nextUrl.searchParams.get('sig') ?? '';
  if (!stepId || !sig || !verifyStepSignature(stepId, sig)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServer();
  const { data: step } = await db.from('kefy_video_steps').select('job_id').eq('id', stepId).maybeSingle();
  if (!step) return NextResponse.json({ ok: true, ignored: 'unknown_step' });

  try {
    // Solo consulta y encola pasos asíncronos: una imagen síncrona lanzada al
    // final de la función podía quedar cortada por maxDuration y pagarse dos
    // veces. Las imágenes y voces las lanzan el polling y el cron.
    const snap = await advanceVideoJob(db, step.job_id as string, { budgetMs: 30 * 1000, syncSteps: false });
    return NextResponse.json({ ok: true, status: snap?.status ?? null });
  } catch (err) {
    reportError(err, { route: 'POST /api/webhooks/video', service: 'video', extra: { stepId } });
    return NextResponse.json({ ok: true, error: 'advance_failed' });
  }
}
