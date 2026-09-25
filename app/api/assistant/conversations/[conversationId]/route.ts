import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthFromRequest } from '@/lib/auth';
import { reportError } from '@/lib/observability';
import { expirePendingActions } from '@/lib/assistant/audit';
import { archiveConversation, getConversationForDisplay } from '@/lib/assistant/conversations';

const notFound = () => NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

// ─── GET /api/assistant/conversations/[conversationId] ───────────────────────
// La conversación lista para pintar: mensajes visibles, estado de cada
// herramienta y las confirmaciones todavía pendientes (para volver a mostrar
// sus tarjetas al recargar).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) return notFound();

  try {
    // Las confirmaciones vencidas se marcan antes de pintar.
    await expirePendingActions(auth.orgId, auth.userId);
    const view = await getConversationForDisplay(conversationId, auth.orgId, auth.userId);
    if (!view) return notFound();

    const { conversation, messages, pendingActions } = view;
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        brand_id: conversation.brand_id,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
      },
      messages,
      pendingActions,
    });
  } catch (err) {
    reportError(err, { route: 'GET /api/assistant/conversations/[conversationId]', auth, service: 'supabase' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── DELETE /api/assistant/conversations/[conversationId] ────────────────────
// Archiva la conversación (no la borra: la auditoría de acciones se conserva).

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) return notFound();

  try {
    const archived = await archiveConversation(conversationId, auth.orgId, auth.userId);
    if (!archived) return notFound();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    reportError(err, { route: 'DELETE /api/assistant/conversations/[conversationId]', auth, service: 'supabase' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
