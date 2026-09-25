import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getAssistantUsage } from '@/lib/usage';
import { reportError } from '@/lib/observability';

// ─── GET /api/assistant/usage ─────────────────────────────────────────────────
// Mensajes del asistente usados, tope y restantes en el mes en curso (período
// UTC 'YYYY-MM'). Chatear no gasta créditos de IA: la cuota es aparte
// (PLAN_ASSISTANT_MESSAGES en lib/usage.ts). El widget lo muestra en su
// encabezado; tras cada turno el evento SSE `done` trae el mismo `usage`.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const usage = await getAssistantUsage(auth.orgId, auth.plan);
    return NextResponse.json({
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      period: usage.period,
    });
  } catch (err) {
    reportError(err, { route: 'GET /api/assistant/usage', auth, service: 'supabase' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
