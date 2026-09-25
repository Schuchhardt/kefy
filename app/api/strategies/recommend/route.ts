import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceErrorResponse } from '@/lib/services/errors';
import { previewStrategy } from '@/lib/services/strategy';

// GET /api/strategies/recommend?objective_id=UUID&industry_id=UUID
// Auth required — returns the matched strategy + its weekly templates
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const objective_id = searchParams.get('objective_id');
  const industry_id = searchParams.get('industry_id');

  if (!objective_id || !industry_id) {
    return NextResponse.json(
      { error: 'objective_id and industry_id are required' },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await previewStrategy(objective_id, industry_id));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/strategies/recommend', auth });
  }
}
