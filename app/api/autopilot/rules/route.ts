import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { autopilotInputFromUiBody, createAutopilotRule, listAutopilotRules } from '@/lib/services/autopilot';

// La lógica vive en lib/services/autopilot.ts (la comparte el asistente).

// ─── GET /api/autopilot/rules ─────────────────────────────────────────────────
// Reglas de la marca activa.
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'strict', source: 'route' });
  try {
    const res = NextResponse.json({ data: await listAutopilotRules(ctx) });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/autopilot/rules', auth });
  }
}

// ─── POST /api/autopilot/rules ────────────────────────────────────────────────
// Crea la regla en la marca activa.
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'strict', source: 'route' });
  try {
    const res = NextResponse.json({ data: await createAutopilotRule(ctx, autopilotInputFromUiBody(input)) }, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/autopilot/rules', auth });
  }
}
