import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { cancelBoost } from '@/lib/zernio';

// ─── DELETE /api/ads/boost/[boostId] ──────────────────────────────────────────
// Cancel an active boost by its internal ID.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ boostId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { boostId } = await params;
  const db = createSupabaseServer();

  const { data: record } = await db
    .from('kefy_ad_boosts')
    .select('id, zernio_boost_id, status')
    .eq('id', boostId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: 'Boost not found' }, { status: 404 });
  if (!['pending', 'active'].includes(record.status)) {
    return NextResponse.json({ error: `Cannot cancel a boost with status: ${record.status}` }, { status: 422 });
  }
  if (!record.zernio_boost_id) {
    return NextResponse.json({ error: 'Boost has no Zernio reference' }, { status: 422 });
  }

  try {
    await cancelBoost(record.zernio_boost_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel boost';
    console.error('cancelBoost error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await db
    .from('kefy_ad_boosts')
    .update({ status: 'cancelled', ended_at: new Date().toISOString() })
    .eq('id', boostId);

  return NextResponse.json({ ok: true });
}
