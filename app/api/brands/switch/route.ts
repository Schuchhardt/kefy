import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, ACTIVE_BRAND_COOKIE, activeBrandCookieOptions } from '@/lib/auth';
import { validateBrandAccess } from '@/lib/brands';

// ─── POST /api/brands/switch ──────────────────────────────────────────────────
// Set the active brand cookie. Validates the brand belongs to the user's org.
// Body: { brandId: string }

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { brandId } = body as Record<string, unknown>;

  if (typeof brandId !== 'string' || !brandId.trim()) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 422 });
  }

  const brand = await validateBrandAccess(brandId, auth);
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

  if (brand.archived) {
    return NextResponse.json({ error: 'Cannot switch to an archived brand' }, { status: 409 });
  }

  const res = NextResponse.json({ brand });
  res.cookies.set(ACTIVE_BRAND_COOKIE, brand.id, activeBrandCookieOptions());
  return res;
}
