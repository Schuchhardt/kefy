import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import {
  autopilotInputFromUiBody, deleteAutopilotRule, getAutopilotRule, updateAutopilotRule,
} from '@/lib/services/autopilot';

type Params = { params: Promise<{ ruleId: string }> };

// Por id: basta con que la regla sea de la org (brandScope 'org'), como antes.

// ─── GET /api/autopilot/rules/[ruleId] ────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ruleId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ data: await getAutopilotRule(ctx, ruleId) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/autopilot/rules/[ruleId]', auth });
  }
}

// ─── PATCH /api/autopilot/rules/[ruleId] ─────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const input = autopilotInputFromUiBody(raw);
  if (raw.status !== undefined) input.status = raw.status;

  const { ruleId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    return NextResponse.json({ data: await updateAutopilotRule(ctx, ruleId, input) });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'PATCH /api/autopilot/rules/[ruleId]', auth });
  }
}

// ─── DELETE /api/autopilot/rules/[ruleId] ────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ruleId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });
  try {
    await deleteAutopilotRule(ctx, ruleId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/autopilot/rules/[ruleId]', auth });
  }
}
