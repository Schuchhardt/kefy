import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, isValidLocale } from '@/lib/i18n';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if pathname already has a locale
  const firstSegment = pathname.split('/')[1];
  if (isValidLocale(firstSegment)) return NextResponse.next();

  // Detect from Accept-Language header
  const acceptLang = req.headers.get('accept-language') || '';
  const preferred = acceptLang.split(',')[0].split('-')[0].toLowerCase();
  const locale = isValidLocale(preferred) ? preferred : defaultLocale;

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
