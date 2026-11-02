import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { checkRateLimit, publishRule, rateLimitResponse } from '@/lib/rate-limit';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { syncScheduledPosts } from '@/lib/services/publish';

// ─── POST /api/content/[itemId]/sync-scheduled ────────────────────────────────
// Reenvía el contenido a sus publicaciones programadas (Zernio guarda una
// copia al programar). El editor lo llama una vez al cerrar, tras autoguardar
// con ?sync=defer. Responde { updated, failed[] }.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Cada llamada reprocesa imágenes y llama a Zernio por publicación.
  const limit = await checkRateLimit(publishRule(auth.orgId));
  if (!limit.allowed) {
    return rateLimitResponse(limit, 'Demasiadas publicaciones en poco tiempo. Espera un momento.');
  }

  const { itemId } = await params;
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    return NextResponse.json(await syncScheduledPosts(ctx, itemId));
  } catch (err) {
    return serviceErrorResponse(err, { route: 'POST /api/content/[itemId]/sync-scheduled', auth });
  }
}
