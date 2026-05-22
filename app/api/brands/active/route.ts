import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';

// ─── GET /api/brands/active ───────────────────────────────────────────────────
// Returns the currently active brand for the session (reads kefy_active_brand cookie).
// Used by the client-side BrandProvider to initialize its state.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);

  if (!brand) {
    return NextResponse.json({ brand: null });
  }

  const res = NextResponse.json({ brand });
  if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
  return res;
}
