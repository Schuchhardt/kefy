import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';

function getJWTSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET env var');
  return new TextEncoder().encode(secret);
}

// ACCESS_TOKEN_TTL_HOURS — configurable vía env var, por defecto 24 horas
const ACCESS_TTL_HOURS  = parseInt(process.env.ACCESS_TOKEN_TTL_HOURS ?? '24', 10);
const ACCESS_TOKEN_TTL  = `${ACCESS_TTL_HOURS}h`;
const ACCESS_TOKEN_MAX_AGE = ACCESS_TTL_HOURS * 60 * 60; // en segundos
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

export interface JWTPayload {
  userId: string;
  orgId:  string;
  role:   'owner' | 'admin' | 'member';
  plan:   'starter' | 'pro' | 'business';
}

// ─── Access token ─────────────────────────────────────────────────────────────

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getJWTSecret());
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJWTSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(48).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);
  return { raw, hash, expiresAt };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

export const ACCESS_COOKIE  = 'kefy_access';
export const REFRESH_COOKIE = 'kefy_refresh';

const IS_PROD = process.env.NODE_ENV === 'production';

export function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    path: '/api/auth/refresh',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  };
}

export function clearCookieOptions(path = '/') {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    path,
    maxAge: 0,
  };
}

// ─── Request auth extraction ──────────────────────────────────────────────────

/**
 * Extract and verify the access JWT from a request.
 * Checks Authorization header first, then falls back to cookie.
 */
export async function getAuthFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifyAccessToken(authHeader.slice(7));
  }

  // 2. httpOnly cookie
  const cookieToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (cookieToken) {
    return verifyAccessToken(cookieToken);
  }

  return null;
}
