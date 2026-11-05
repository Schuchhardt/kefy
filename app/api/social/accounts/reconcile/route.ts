import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/observability';
import { reconcileSocialAccounts } from '@/lib/services/social-integrity';

// ─── GET /api/social/accounts/reconcile ──────────────────────────────────────
// Cron diario: compara las cuentas de Kefy con las de Zernio. No gasta créditos
// ni llama a proveedores de IA. Ver docs/zernio.md.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await reconcileSocialAccounts());
  } catch (err) {
    reportError(err, { route: '/api/social/accounts/reconcile', service: 'zernio' });
    return NextResponse.json({ error: 'Reconcile failed' }, { status: 500 });
  }
}
