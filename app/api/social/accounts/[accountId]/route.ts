import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';

// ─── DELETE /api/social/accounts/[accountId] ─────────────────────────────────
// Disconnect a social account (revokes Zernio token + removes from DB).

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { accountId } = await params;
  const db = createSupabaseServer();

  // Fetch — verify ownership
  const { data: account, error: fetchError } = await db
    .from('kefy_social_accounts')
    .select('id, zernio_account_id, org_id')
    .eq('id', accountId)
    .eq('org_id', auth.orgId)
    .maybeSingle();

  if (fetchError) {
    console.error('social account fetch error:', fetchError.message);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Revoke on Zernio (best-effort — don't fail if Zernio is down)
  if (account.zernio_account_id) {
    try {
      const { disconnectAccount } = await import('@/lib/zernio');
      await disconnectAccount(account.zernio_account_id);
    } catch (err) {
      console.warn('Zernio disconnect warning:', err instanceof Error ? err.message : err);
    }
  }

  const { error: deleteError } = await db
    .from('kefy_social_accounts')
    .delete()
    .eq('id', account.id);

  if (deleteError) {
    console.error('social account delete error:', deleteError.message);
    return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
