import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getLeadScoringConfig, updateLeadScoringConfig } from '@/lib/services/lead-scoring';

// ─── /api/automations/leads/scoring ──────────────────────────────────────────
// Puntos por interacción y umbrales de etapa de la marca activa. La lógica
// vive en lib/services/lead-scoring.ts.

// GET: la configuración (la de por defecto si la marca no tiene una).
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const res = NextResponse.json({ config: await getLeadScoringConfig(ctx) });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/automations/leads/scoring', auth });
  }
}

// PATCH — Body: { defaults?: {...}, thresholds?: {...} }
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const res = NextResponse.json({ config: await updateLeadScoringConfig(ctx, body) });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/automations/leads/scoring', auth });
  }
}
