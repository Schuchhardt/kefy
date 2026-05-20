import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getInboxConversations } from '@/lib/zernio';

// ─── POST /api/messaging/sync ─────────────────────────────────────────────────
// Pulls the latest 100 conversations from Zernio's unified inbox and upserts
// them into kefy_messages so the inbox is populated even without webhooks.
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

  const db = createSupabaseServer();

  // Fetch the org's Zernio profile ID (used to scope the request)
  const { data: org } = await db
    .from('kefy_organizations')
    .select('zernio_profile_id')
    .eq('id', auth.orgId)
    .maybeSingle();

  // Build map: zernio_account_id → { id (kefy uuid), platform }
  const { data: accounts } = await db
    .from('kefy_social_accounts')
    .select('id, platform, zernio_account_id')
    .eq('org_id', auth.orgId)
    .eq('status', 'active')
    .not('zernio_account_id', 'is', null);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, message: 'No active accounts with Zernio connection' });
  }

  const accountMap = new Map<string, { id: string; platform: string }>();
  for (const a of accounts) {
    if (a.zernio_account_id) accountMap.set(a.zernio_account_id, { id: a.id, platform: a.platform });
  }

  // Fetch conversations from Zernio
  let inboxResponse;
  try {
    inboxResponse = await getInboxConversations({
      ...(org?.zernio_profile_id ? { profileId: org.zernio_profile_id } : {}),
      sortOrder: 'desc',
      limit: 100,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch inbox conversations';
    console.error('Zernio getInboxConversations error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const conversations = inboxResponse.data ?? [];
  if (conversations.length === 0) {
    return NextResponse.json({ synced: 0, failed: inboxResponse.meta?.accountsFailed ?? 0 });
  }

  // Build upsert rows — only for accounts belonging to this org
  type MessageRow = {
    org_id:              string;
    social_account_id:   string;
    platform:            string;
    platform_thread_id:  string;
    platform_message_id: string;
    sender_id:           string;
    sender_name:         string | null;
    sender_avatar:       string | null;
    body:                string;
    direction:           'inbound';
    created_at:          string;
  };

  const rows: MessageRow[] = [];

  for (const conv of conversations) {
    const account = accountMap.get(conv.accountId);
    if (!account) continue; // belongs to a different org or not found

    rows.push({
      org_id:              auth.orgId,
      social_account_id:   account.id,
      platform:            account.platform,
      platform_thread_id:  conv.id,
      // Sentinel message ID — stable per conversation, allows idempotent upsert
      platform_message_id: `sync:${conv.id}`,
      sender_id:           conv.participantId,
      sender_name:         conv.participantName ?? null,
      sender_avatar:       conv.participantPicture ?? null,
      body:                conv.lastMessage,
      direction:           'inbound',
      created_at:          conv.updatedTime,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0, failed: inboxResponse.meta?.accountsFailed ?? 0 });
  }

  const { error: upsertError } = await db
    .from('kefy_messages')
    .upsert(rows, { onConflict: 'social_account_id,platform_message_id', ignoreDuplicates: false });

  if (upsertError) {
    console.error('messaging sync upsert error:', upsertError.message);
    return NextResponse.json({ error: 'Failed to save conversations' }, { status: 500 });
  }

  return NextResponse.json({
    synced: rows.length,
    failed: inboxResponse.meta?.accountsFailed ?? 0,
  });
}
