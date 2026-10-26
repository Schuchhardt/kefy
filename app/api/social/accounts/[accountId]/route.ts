import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { disconnectSocialAccount } from '@/lib/services/social';

// ─── DELETE /api/social/accounts/[accountId] ─────────────────────────────────
// Disconnect a social account (revokes Zernio token + removes from DB).
// La lógica vive en disconnectSocialAccount (lib/services/social.ts).

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
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    await disconnectSocialAccount(ctx, accountId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'DELETE /api/social/accounts/[accountId]', auth });
  }
}
