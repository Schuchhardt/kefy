import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getThreadMessages, markThreadRead, refreshThread, replyToThread } from '@/lib/services/inbox';

// La lógica vive en lib/services/inbox.ts (la comparte el asistente). Estas
// rutas no tienen marca: alcance 'org', la cuenta se valida por org_id.

// ─── GET /api/messaging/[threadId] ────────────────────────────────────────────
// Returns all messages in a thread (ordered ascending for conversation view).
//
// Query params:
//   account_id — social_account_id (required to scope the thread correctly)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId } = await params;
  const accountId = req.nextUrl.searchParams.get('account_id');

  if (!accountId) return NextResponse.json({ error: 'account_id is required' }, { status: 422 });

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    // Historial de Zernio → base de datos, lectura, y luego se marca como leído
    // (la respuesta lleva los mensajes tal como estaban antes de marcarlos).
    await refreshThread(ctx, { threadId, accountId });
    const { messages, account } = await getThreadMessages(ctx, { threadId, accountId });
    await markThreadRead(ctx, messages);
    return NextResponse.json({ messages, account });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/messaging/[threadId]', auth });
  }
}

// ─── POST /api/messaging/[threadId]/reply ─────────────────────────────────────
// Send a reply to a DM thread via Zernio and store it locally.
//
// Body:
//   account_id — social_account_id (required)
//   text       — message text (required)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.account_id !== 'string' || !input.account_id) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 422 });
  }
  if (typeof input.text !== 'string' || !input.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 422 });
  }

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    const out = await replyToThread(ctx, { threadId, accountId: input.account_id, text: input.text });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/messaging/[threadId]', auth });
  }
}
