import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { defaultLocale, isValidLocale } from '@/lib/i18n';

const ACCESS_COOKIE = 'kefy_access';

const PUBLIC_API_PATHS = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/waitlist',
];

async function verifyToken(token: string) {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; orgId: string; role: string; plan: string };
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Auth protection ─────────────────────────────────────────────────────────
  const isDashboard    = /^\/[a-z]{2}\/dashboard/.test(pathname);
  const isProtectedApi = pathname.startsWith('/api/') && !PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));

  if (isDashboard || isProtectedApi) {
    const token = req.cookies.get(ACCESS_COOKIE)?.value;

    if (!token) {
      if (isDashboard) {
        const lang = pathname.split('/')[1] ?? defaultLocale;
        return NextResponse.redirect(new URL(`/${lang}/login`, req.url));
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      if (isDashboard) {
        const lang = pathname.split('/')[1] ?? defaultLocale;
        const loginUrl = new URL(`/${lang}/login`, req.url);
        loginUrl.searchParams.set('expired', '1');
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    // Forward auth context to route handlers via headers
    const res = NextResponse.next();
    res.headers.set('x-user-id', payload.userId);
    res.headers.set('x-org-id', payload.orgId);
    res.headers.set('x-user-role', payload.role);
    res.headers.set('x-user-plan', payload.plan);
    return res;
  }

  // ── i18n locale redirect ────────────────────────────────────────────────────
  // Skip API routes and static assets
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const firstSegment = pathname.split('/')[1];
  if (isValidLocale(firstSegment)) return NextResponse.next();

  const acceptLang = req.headers.get('accept-language') || '';
  const preferred  = acceptLang.split(',')[0].split('-')[0].toLowerCase();
  const locale     = isValidLocale(preferred) ? preferred : defaultLocale;

  const url      = req.nextUrl.clone();
  url.pathname   = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)',],
};
