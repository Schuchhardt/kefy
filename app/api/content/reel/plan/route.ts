import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getVideoPlan } from '@/lib/services/video';

export const runtime = 'nodejs';

// ─── GET /api/content/reel/plan?itemId=&format=&motion=&lang= ────────────────
// The production plan of a reel/story: every tool call its script will run
// (images, animation, voices, lip-sync, final edit), with dependencies and
// credits, plus what it would cost at each motion level. Spends nothing — it
// is what the user sees before pressing "Produce video".

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const itemId = params.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 });

  const ctx = serviceContext(auth, '', params.get('lang') === 'en' ? 'en' : 'es', { brandScope: 'org', source: 'route' });
  try {
    const plan = await getVideoPlan(ctx, { itemId, format: params.get('format'), motion: params.get('motion') });
    return NextResponse.json(plan);
  } catch (e) {
    return serviceErrorResponse(e, { route: 'GET /api/content/reel/plan', auth });
  }
}
