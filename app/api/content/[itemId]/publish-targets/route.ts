import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { listPublishTargets } from '@/lib/services/publish';
import type { ContentType } from '@/types/content';

const VALID_FORMATS: ContentType[] = ['post', 'carousel', 'reel', 'story'];

// ─── GET /api/content/[itemId]/publish-targets ───────────────────────────────
// Por cada cuenta de la marca del contenido: si ya está publicado o programado
// ahí, si todavía se puede publicar (y se recomienda) o si la red no admite el
// formato. La lógica vive en listPublishTargets (lib/services/publish.ts),
// compartida con la herramienta list_publish_targets.
//
// Query: ?format=post|carousel|reel|story (por defecto, el del contenido).
// Leer no gasta créditos ni exige suscripción activa; publicar sí.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { itemId } = await params;
  const format = new URL(req.url).searchParams.get('format');
  if (format !== null && !VALID_FORMATS.includes(format as ContentType)) {
    return NextResponse.json({ error: `format must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 422 });
  }

  // Como el resto de /api/content/[itemId]: filtra por organización y las
  // cuentas salen de la marca del propio contenido.
  const ctx = serviceContext(auth, '', 'es', { brandScope: 'org', source: 'route' });

  try {
    const out = await listPublishTargets(ctx, itemId, { format: (format ?? undefined) as ContentType | undefined });
    return NextResponse.json(out);
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/content/[itemId]/publish-targets', auth });
  }
}
