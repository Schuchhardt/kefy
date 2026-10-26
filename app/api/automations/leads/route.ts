import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listLeads, upsertLead } from '@/lib/services/leads';

// GET /api/automations/leads
// Query params: stage?, channel?, search?, limit?, offset?
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const out = await listLeads(ctx, {
      stage:   searchParams.get('stage'),
      channel: searchParams.get('channel'),
      search:  searchParams.get('search'),
      limit:   parseInt(searchParams.get('limit') ?? '100', 10),
      offset:  parseInt(searchParams.get('offset') ?? '0', 10),
    });
    const res = NextResponse.json(out);
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/automations/leads', auth });
  }
}

// POST /api/automations/leads
// Body: { username, channel, display_name?, avatar_url?, stage?, score?, notes?, tags? }
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });
  try {
    const res = NextResponse.json({ lead: await upsertLead(ctx, body) }, { status: 201 });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/automations/leads', auth });
  }
}
