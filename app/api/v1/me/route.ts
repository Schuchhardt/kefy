import { NextRequest, NextResponse } from 'next/server';
import { getActiveBrandById, listActiveBrands } from '@/lib/brands';
import { getUsage } from '@/lib/usage';
import { withApiKey } from '@/lib/assistant/http';

// ─── GET /api/v1/me ──────────────────────────────────────────────────────────
// Qué ve esta API key: organización, rol (el actual de quien la creó), scopes,
// marca atada, marcas sobre las que puede actuar y créditos del mes.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return withApiKey(req, 'GET /api/v1/me', async (ctx, a) => {
    const bound = a.key.brand_id ? await getActiveBrandById(a.key.brand_id, ctx.orgId) : null;
    const boundBrand = bound ? { id: bound.id, name: bound.name } : null;

    const [brands, credits] = await Promise.all([
      boundBrand
        ? Promise.resolve([boundBrand])
        : listActiveBrands(ctx.orgId).then((list) => list.map((b) => ({ id: b.id, name: b.name }))),
      getUsage(ctx.orgId, a.plan),
    ]);

    return NextResponse.json({
      org: { id: ctx.orgId, name: a.orgName, plan: a.plan },
      role: a.role,
      scopes: a.key.scopes,
      key: { id: a.key.id, prefix: a.key.key_prefix },
      bound_brand: boundBrand,
      brands,
      credits,
    });
  });
}
