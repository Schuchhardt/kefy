import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import {
  getAuthFromRequest,
  hashToken,
  clearCookieOptions,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  const rawRefresh = req.cookies.get(REFRESH_COOKIE)?.value;

  // Invalidate refresh token in DB if present
  if (rawRefresh) {
    const db = createSupabaseServer();
    await db
      .from('refresh_tokens')
      .delete()
      .eq('token_hash', hashToken(rawRefresh));
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, '', clearCookieOptions());
  res.cookies.set(REFRESH_COOKIE, '', clearCookieOptions('/api/auth/refresh'));
  return res;
}
