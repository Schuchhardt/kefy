import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { syncInbox } from '@/lib/services/inbox';

// ─── POST /api/messaging/sync ─────────────────────────────────────────────────
// Pulls the latest 100 conversations from Zernio's unified inbox and upserts
// them into kefy_messages so the inbox is populated even without webhooks.
// La lógica vive en lib/services/inbox.ts (la comparte el asistente).
//
// Each conversation produces one message row using the conversation ID as the
// platform_message_id sentinel (`sync:{conv.id}`), which keeps upserts
// idempotent. Only conversations whose accountId matches a social account
// belonging to the current org are saved.
//
// Returns: { synced: number, failed: number }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Alcance 'org': todas las cuentas de la organización (como siempre).
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json(await syncInbox(ctx));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/messaging/sync', auth });
  }
}
