import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getOrgStrategy, setOrgStrategy, type OrgStrategyPatch } from '@/lib/services/strategy';

// La estrategia es de la organización: estas rutas no resuelven la marca
// activa, así que el contexto va sin brandId (brandScope 'org' no lo usa).

// GET /api/strategies/org
// Returns the current org's saved strategy selection
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    const { selection } = await getOrgStrategy(ctx, { withNames: false });
    return NextResponse.json({ selection });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies/org', auth });
  }
}

// PATCH /api/strategies/org
// Upserts the org's strategy selection
// Body: { objective_id, industry_id, strategy_id, custom_strategy_id?, custom_notes? }
// custom_strategy_id activa una estrategia propia (null vuelve al catálogo).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: OrgStrategyPatch;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Un cuerpo JSON que no es un objeto (null, número…) no trae ningún campo.
  const input: OrgStrategyPatch = body && typeof body === 'object' ? body : {};
  const { objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes } = input;

  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json(
      await setOrgStrategy(ctx, { objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes }),
    );
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/strategies/org', auth });
  }
}
