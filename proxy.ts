import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { defaultLocale, isValidLocale } from '@/lib/i18n';

const ACCESS_COOKIE = 'kefy_access';

const PUBLIC_API_PATHS = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  // Aceptar una invitación: el GET describe la invitación sin sesión (para
  // poder mostrar a qué organización se entra antes de registrarse) y el POST
  // valida la sesión por su cuenta.
  '/api/team/invitations/accept',
  // Versión del build: la consulta el cliente para detectar despliegues nuevos.
  '/api/version',
  '/api/webhooks/',
  // Vercel Cron endpoints: no llevan cookie de sesión, se autentican solos
  // contra CRON_SECRET / AUTOPILOT_CRON_SECRET dentro del route handler.
  '/api/autopilot/run',
  '/api/content-library/generate',
  '/api/content/reel/reconcile',
  // API pública y servidor MCP: se autentican con API key dentro del handler
  // (lib/assistant/api-keys.ts). No aceptan la cookie de sesión.
  '/api/v1/',
  '/api/mcp',
];

/**
 * La ruta es pública si coincide con una entrada o cuelga de ella. El corte es
 * por segmento: `/api/mcp` cubre `/api/mcp` y `/api/mcp/…`, pero no
 * `/api/mcp-admin`; si no, cualquier ruta nueva que empezara igual quedaría
 * sin la comprobación de sesión. Las entradas que acaban en `/` ya son un
 * prefijo de segmento.
 */
function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

async function verifyToken(token: string) {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; orgId: string; role: string; plan: string };
  } catch {
    return null;
  }
}


/**
 * Login con `?next=` para volver a la página del dashboard que se pidió (p. ej.
 * el link del asistente para conectar una red). La portada del dashboard no
 * lo necesita. El login solo acepta rutas del dashboard (lib/safe-redirect).
 */
function loginRedirectUrl(req: NextRequest, lang: string): URL {
  const loginUrl = new URL(`/${lang}/login`, req.url);
  const target = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (target !== `/${lang}/dashboard`) loginUrl.searchParams.set('next', target);
  return loginUrl;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Auth protection ─────────────────────────────────────────────────────────
  const isDashboard    = /^\/[a-z]{2}\/dashboard/.test(pathname);
  const isProtectedApi = pathname.startsWith('/api/') && !isPublicApiPath(pathname);

  if (isDashboard || isProtectedApi) {
    const token = req.cookies.get(ACCESS_COOKIE)?.value;

    if (!token) {
      if (isDashboard) {
        const lang = pathname.split('/')[1] ?? defaultLocale;
        return NextResponse.redirect(loginRedirectUrl(req, lang));
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      if (isDashboard) {
        const lang = pathname.split('/')[1] ?? defaultLocale;
        const loginUrl = loginRedirectUrl(req, lang);
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
  //
  // `/monitoring` es el túnel de Sentry (`tunnelRoute` en next.config.ts): por
  // ahí pasan los eventos de error del navegador. Sin esta excepción caería en
  // el redirect de idioma de abajo y acabaría en `/es/monitoring`, que no
  // existe: los errores del cliente nunca llegarían a Sentry.
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/monitoring') ||
    pathname.includes('.')
  ) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)',],
};
