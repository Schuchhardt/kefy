import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { getBrandFromRequest } from '@/lib/brands';
import { serviceContext } from '@/lib/services/context';
import { serviceErrorResponse } from '@/lib/services/errors';
import { getInboxSummary } from '@/lib/services/inbox';

// ─── GET /api/messaging/summary ───────────────────────────────────────────────
// DMs sin leer y comentarios sin responder de la marca activa, para el aviso
// de la navegación (Sidebar y BottomNav, vía hooks/useUnreadCount).
//
// Antes el badge pedía las listas con `limit=1` y sumaba sus longitudes: nunca
// pasaba de 2. Esto cuenta en la base (head: true) y no trae filas.

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { brand, setCookieHeader } = await getBrandFromRequest(req, auth);
  if (!brand) return NextResponse.json({ error: 'No brand found' }, { status: 404 });

  const ctx = serviceContext(auth, brand.id, 'es', { brandScope: 'org', source: 'route' });

  try {
    const summary = await getInboxSummary(ctx);
    const res = NextResponse.json({
      ...summary,
      total: summary.unread_dms + summary.unreplied_comments,
    });
    if (setCookieHeader) res.headers.set('Set-Cookie', setCookieHeader);
    return res;
  } catch (err) {
    return serviceErrorResponse(err, { route: 'GET /api/messaging/summary', auth });
  }
}
