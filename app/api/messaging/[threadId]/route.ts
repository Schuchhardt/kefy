import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getConversationMessages, sendConversationMessage } from '@/lib/zernio';

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

  const db = createSupabaseServer();

  // Verify the account belongs to this org
  const { data: account } = await db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, platform, username')
    .eq('id', accountId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // ── Fetch message history from Zernio and upsert ──────────────────────────
  if (account.zernio_account_id) {
    try {
      const zernioRes = await getConversationMessages(threadId, account.zernio_account_id, {
        sortOrder: 'asc',
        limit: 100,
      });

      if (zernioRes.messages && zernioRes.messages.length > 0) {
        const rows = zernioRes.messages.map((m) => ({
          org_id:              auth.orgId,
          social_account_id:   account.id,
          platform:            account.platform,
          platform_thread_id:  threadId,
          platform_message_id: m.id,
          zernio_message_id:   m.id,
          sender_id:           m.senderId,
          sender_name:         m.senderName ?? null,
          sender_avatar:       null as null,
          body:                m.message,
          direction:           m.direction === 'incoming' ? 'inbound' : 'outbound',
          read_at:             m.direction === 'outgoing' ? new Date().toISOString() : null as null,
          created_at:          m.createdAt,
        }));

        await db
          .from('kefy_messages')
          .upsert(rows, { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: false });
      }
    } catch (err) {
      // Non-fatal — fall back to whatever is already in the DB
      console.error('getConversationMessages error:', err instanceof Error ? err.message : err);
    }
  }

  const { data: messages, error } = await db
    .from('kefy_messages')
    .select('id, sender_id, sender_name, sender_avatar, body, direction, read_at, created_at')
    .eq('org_id', auth.orgId)
    .eq('social_account_id', accountId)
    .eq('platform_thread_id', threadId)
    .not('platform_message_id', 'ilike', 'sync:%')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('thread GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 });
  }

  // Mark unread inbound messages as read
  const unreadIds = (messages ?? [])
    .filter((m) => m.direction === 'inbound' && !m.read_at)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    const now = new Date().toISOString();
    await db
      .from('kefy_messages')
      .update({ read_at: now })
      .in('id', unreadIds);
  }

  return NextResponse.json({ messages: messages ?? [], account });
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

  const db = createSupabaseServer();

  // Verify the account belongs to this org and is active
  const { data: account } = await db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, platform, username')
    .eq('id', input.account_id as string)
    .eq('org_id', auth.orgId)
    .eq('status', 'active')
    .maybeSingle();

  if (!account) return NextResponse.json({ error: 'Account not found or inactive' }, { status: 404 });
  if (!account.zernio_account_id) return NextResponse.json({ error: 'Account not connected to Zernio' }, { status: 422 });

  // Send via Zernio inbox conversations endpoint
  let sent;
  try {
    sent = await sendConversationMessage(threadId, account.zernio_account_id, (input.text as string).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send message';
    console.error('sendConversationMessage error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Store outbound message locally
  const { data: stored, error: storeError } = await db
    .from('kefy_messages')
    .insert({
      org_id:               auth.orgId,
      social_account_id:    account.id,
      platform:             account.platform,
      platform_thread_id:   threadId,
      platform_message_id:  sent.messageId,
      zernio_message_id:    sent.messageId,
      sender_id:            'self',
      sender_name:          account.username ?? null,
      sender_avatar:        null,
      body:                 (input.text as string).trim(),
      direction:            'outbound',
      read_at:              new Date().toISOString(),
    })
    .select()
    .single();

  if (storeError) {
    console.error('store outbound message error:', storeError.message);
    // Don't fail — the message was already sent via Zernio
  }

  return NextResponse.json({ message: stored ?? sent }, { status: 201 });
}
