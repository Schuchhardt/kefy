import { NextRequest, NextResponse } from 'next/server';
import { collectExpiredWindows } from '@/lib/rate-limit';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { runAutopilotNow, runScheduledAutopilot, type AutopilotRunSummary } from '@/lib/services/autopilot';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── /api/autopilot/run ───────────────────────────────────────────────────────
// Evaluate active autopilot rules whose next_run_at <= now and execute them.
//
// Invocation modes:
//   - GET  (Vercel Cron): header `Authorization: Bearer ${CRON_SECRET}`.
//     Vercel sets this automatically for cron schedules defined in vercel.json.
//     Falls back to AUTOPILOT_CRON_SECRET if CRON_SECRET is not set.
//   - POST (manual/webhook): authenticated user (owner/admin) OR
//     body `{ cron_secret: string }` matching AUTOPILOT_CRON_SECRET.
//
// POST body (optional):
//   { rule_ids?: string[] }   — run only specific rules (org-scoped)
//   { cron_secret?: string }  — allow unauthenticated cron invocation
//
// La ejecución vive en lib/services/autopilot.ts. Una ejecución pedida por una
// persona cobra 1 crédito de texto por regla (guardia de gasto, AGENTS.md);
// el cron no cobra.

function isVercelCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.AUTOPILOT_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isVercelCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runCron(null);
}

export async function POST(req: NextRequest) {
  // Support both authenticated users and cron calls via shared secret
  const cronSecret = process.env.AUTOPILOT_CRON_SECRET;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* no body */ }

  const isCronBody = cronSecret && typeof body.cron_secret === 'string' && body.cron_secret === cronSecret;
  const isCron = isCronBody || isVercelCronAuthorized(req);

  const ruleIds = Array.isArray(body.rule_ids)
    ? (body.rule_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : null;

  if (isCron) return runCron(ruleIds);

  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Por id de regla basta con la org, como antes (brandScope 'org').
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return summaryResponse(await runAutopilotNow(ctx, ruleIds, 'POST /api/autopilot/run'));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/autopilot/run', auth });
  }
}

async function runCron(ruleIds: string[] | null) {
  // Mantenimiento: la tabla de rate limits acumula una fila por ventana y nada
  // la vacía sola. Este cron ya corre cada 5 minutos, así que es el sitio
  // natural para la limpieza. No se espera el resultado ni bloquea nada.
  void collectExpiredWindows();

  try {
    return summaryResponse(await runScheduledAutopilot(ruleIds));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'autopilot cron' });
  }
}

function summaryResponse(summary: AutopilotRunSummary) {
  if (summary.results.length === 0) return NextResponse.json({ executed: 0, results: [] });
  return NextResponse.json(summary, {
    status: summary.failed > 0 && summary.executed === 0 ? 502 : 200,
  });
}


