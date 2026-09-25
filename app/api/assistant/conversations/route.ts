import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getAssistantUsage } from '@/lib/usage';
import { reportError } from '@/lib/observability';
import { listConversations } from '@/lib/assistant/conversations';

const ROUTE = 'GET /api/assistant/conversations';

// ─── GET /api/assistant/conversations?limit=30&before=<ISO> ──────────────────
// Conversaciones del usuario (no archivadas), de la más reciente a la más
// antigua. Paginación por cursor: `before` = last_message_at de la última
// recibida. Incluye `usage`, los mensajes del asistente usados y restantes
// este mes, para el encabezado del widget.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number(sp.get('limit') ?? 30);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 30) : 30;

  const beforeRaw = sp.get('before');
  let before: string | undefined;
  if (beforeRaw) {
    const d = new Date(beforeRaw);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'before must be an ISO date' }, { status: 422 });
    }
    before = d.toISOString();
  }

  try {
    const [conversations, usage] = await Promise.all([
      listConversations(auth.userId, auth.orgId, { limit, before }),
      getAssistantUsage(auth.orgId, auth.plan).catch(() => null),
    ]);
    return NextResponse.json({
      conversations,
      usage: usage ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : null,
    });
  } catch (err) {
    reportError(err, { route: ROUTE, auth, service: 'supabase' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
