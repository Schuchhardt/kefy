import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

// ─── GET /api/messaging ────────────────────────────────────────────────────────
// Returns the latest inbound message per thread for the org (unified inbox).
//
// Query params:
//   platform  — filter by platform (optional)
//   unread    — 'true' to return only unread threads
//   limit     — default 50, max 100
//   offset    — default 0

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform');
  const unread   = searchParams.get('unread') === 'true';
  const limit    = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100);
  const offset   = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

  const VALID_PLATFORMS = new Set(['linkedin','instagram','facebook','twitter','tiktok','threads']);

  const db = createSupabaseServer();

  // Fetch all messages and group by thread in JS (Supabase JS has no DISTINCT ON)
  let query = db
    .from('kefy_messages')
    .select(`
      id, platform, platform_thread_id, platform_message_id,
      sender_id, sender_name, sender_avatar,
      body, direction, read_at, created_at,
      kefy_social_accounts!inner ( id, platform, username, avatar_url )
    `)
    .eq('brand_id', brand.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit * 3 - 1); // overfetch to dedupe threads

  if (platform && VALID_PLATFORMS.has(platform)) {
    query = query.eq('platform', platform);
  }
  if (unread) {
    query = query.is('read_at', null).eq('direction', 'inbound');
  }

  const { data: messages, error } = await query;

  if (error) {
    console.error('messaging GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Dedupe: keep the latest message per thread
  const byThread = new Map<string, typeof messages[number]>();
  for (const msg of messages ?? []) {
    const key = `${(msg.kefy_social_accounts as unknown as { id: string }).id}::${msg.platform_thread_id}`;
    if (!byThread.has(key)) byThread.set(key, msg);
  }

  const threads = Array.from(byThread.values()).slice(0, limit);

  const res = NextResponse.json({ threads });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
