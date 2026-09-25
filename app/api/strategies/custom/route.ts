import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listCustomStrategies } from '@/lib/services/custom-strategy';
import { saveCustomStrategy } from '@/lib/services/strategy';

// Estrategias propias de la organización. Como la selección de estrategia
// (/api/strategies/org), son de la org y solo owner/admin las crean.

function language(req: NextRequest): 'es' | 'en' {
  return req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'es';
}

// GET /api/strategies/custom → { strategies }
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = serviceContext(auth, '', language(req), { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ strategies: await listCustomStrategies(ctx) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies/custom', auth });
  }
}

// POST /api/strategies/custom
// Body: { name, description?, objective_id?, based_on_strategy_id?, kpi_primary?,
//         kpi_secondary?, cta_mechanic?, calendar: [...], activate? }
// → 201 { strategy, selection }
export async function POST(req: NextRequest) {
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
  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const { activate, id: _ignored, ...fields } = input;

  const ctx = serviceContext(auth, '', language(req), { brandScope: 'org', source: 'route' });
  try {
    const result = await saveCustomStrategy(ctx, { ...fields, activate: activate === true });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/strategies/custom', auth });
  }
}
