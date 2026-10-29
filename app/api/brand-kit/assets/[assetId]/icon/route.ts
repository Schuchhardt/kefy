import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { createIconFromAsset } from '@/lib/services/brand-assets';

// ─── POST /api/brand-kit/assets/[assetId]/icon ────────────────────────────────
// Recorta un ícono cuadrado del logo `assetId` y lo guarda en la biblioteca de
// la misma marca. Body: { crop?: { x, y, width, height } (fracciones 0–1),
// label? }. Sin crop se usa el recorte propuesto. Se hace con sharp, sin IA:
// no gasta créditos. Solo owner/admin.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!['owner', 'admin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { assetId } = await params;
  const body = await req.json().catch(() => ({})) as { crop?: unknown; label?: unknown };

  const ctx = serviceContext(auth, '', 'en', { brandScope: 'org', source: 'route' });
  try {
    const { asset } = await createIconFromAsset(ctx, assetId, {
      crop: (body?.crop ?? null) as never,
      label: typeof body?.label === 'string' ? body.label : null,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/brand-kit/assets/[assetId]/icon', auth });
  }
}
