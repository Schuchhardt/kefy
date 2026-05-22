import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { ACTIVE_BRAND_COOKIE, activeBrandCookieOptions, type JWTPayload } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Brand {
  id:          string;
  org_id:      string;
  name:        string;
  slug:        string;
  avatar_url:  string | null;
  archived:    boolean;
  created_at:  string;
  updated_at:  string;
}

// ─── Plan limits ──────────────────────────────────────────────────────────────

export const BRAND_LIMITS: Record<string, number> = {
  starter:  1,
  pro:      3,
  business: Infinity,
};

// ─── Slug helper ──────────────────────────────────────────────────────────────

export function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'brand';
}

// ─── getBrandFromRequest ──────────────────────────────────────────────────────
// Reads the active brand from the cookie, validates it belongs to the org,
// and returns the brand row. If no cookie or brand not found, falls back to
// the org's first active brand and sets the cookie in the response.
//
// Returns { brand, setCookieHeader } — callers should forward setCookieHeader
// to the response when present.

export async function getBrandFromRequest(
  req: NextRequest,
  auth: JWTPayload,
): Promise<{ brand: Brand | null; setCookieHeader?: string }> {
  const db = createSupabaseServer();
  const cookieBrandId = req.cookies.get(ACTIVE_BRAND_COOKIE)?.value;

  if (cookieBrandId) {
    const { data: brand } = await db
      .from('kefy_brands')
      .select('*')
      .eq('id', cookieBrandId)
      .eq('org_id', auth.orgId)
      .eq('archived', false)
      .maybeSingle();

    if (brand) return { brand: brand as Brand };
    // Cookie points to a brand from a different org or archived — fall through
  }

  // Fallback: use first active brand for the org
  const { data: first } = await db
    .from('kefy_brands')
    .select('*')
    .eq('org_id', auth.orgId)
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!first) return { brand: null };

  // Build Set-Cookie header so the caller can persist the fallback
  const opts = activeBrandCookieOptions();
  const secure = opts.secure ? '; Secure' : '';
  const setCookieHeader =
    `${ACTIVE_BRAND_COOKIE}=${first.id}; Path=${opts.path}; Max-Age=${opts.maxAge}; HttpOnly; SameSite=Lax${secure}`;

  return { brand: first as Brand, setCookieHeader };
}

// ─── validateBrandAccess ──────────────────────────────────────────────────────
// Returns the brand if it belongs to the org, null otherwise.

export async function validateBrandAccess(
  brandId: string,
  auth: JWTPayload,
): Promise<Brand | null> {
  const db = createSupabaseServer();
  const { data: brand } = await db
    .from('kefy_brands')
    .select('*')
    .eq('id', brandId)
    .eq('org_id', auth.orgId)
    .maybeSingle();
  return (brand as Brand | null) ?? null;
}

// ─── withBrand ────────────────────────────────────────────────────────────────
// Convenience wrapper: resolves brand and forwards the Set-Cookie header if
// the fallback brand was used. Returns 404 if no brand exists for the org.

export async function withBrand(
  req: NextRequest,
  auth: JWTPayload,
  handler: (brand: Brand, res: NextResponse) => Promise<NextResponse>,
): Promise<NextResponse> {
  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);

  if (!brand) {
    return NextResponse.json({ error: 'No brand found for this organization' }, { status: 404 });
  }

  const res = await handler(brand, new NextResponse());

  if (setCookieHeader) {
    res.headers.set('Set-Cookie', setCookieHeader);
  }

  return res;
}
