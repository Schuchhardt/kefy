import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { runDueEngagementJobs } from '@/lib/engagement-executor';

export const runtime     = 'nodejs';
export const maxDuration = 300;

// ─── /api/automations/engagement/run ──────────────────────────────────────────
// Vercel Cron (cada 5 minutos): ejecuta las respuestas automáticas con espera
// (delay_minutes > 0) que ya vencieron. El webhook de Zernio las encola en
// kefy_engagement_jobs; la ejecución vive en lib/engagement-executor.ts.
//
// Auth: header `Authorization: Bearer ${CRON_SECRET}` (lo pone Vercel), igual
// que /api/autopilot/run. Las respuestas con IA se cobran a la organización
// con la misma guardia que en el webhook.

function isVercelCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.AUTOPILOT_CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const summary = await runDueEngagementJobs(createSupabaseServer());
  return NextResponse.json(summary);
}
