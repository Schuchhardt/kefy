// ─── Contexto de ejecución del asistente ─────────────────────────────────────
//
// Resuelve sobre qué marca actúa una llamada y construye el ToolContext con el
// que se ejecutan las herramientas. Las herramientas siempre corren con
// brandScope 'strict': solo tocan datos de esa marca.

import type { JWTPayload } from '@/types/auth';
import { getActiveBrandById, listActiveBrands } from '@/lib/brands';
import { ServiceError } from '@/lib/services/errors';
import type { ToolContext } from '@/lib/assistant/types';

/**
 * Marca sobre la que actúa una llamada externa (MCP / API).
 *
 *   - Key atada a una marca + brand_id distinto → 403.
 *   - brand_id pedido (o la marca atada) → tiene que existir y no estar
 *     archivada en la organización.
 *   - Sin brand_id: si la organización tiene una sola marca activa, esa; si
 *     tiene varias, 400 con la lista para que el cliente elija.
 */
export async function resolveBrandForContext({
  orgId,
  boundBrandId,
  requestedBrandId,
}: {
  orgId: string;
  boundBrandId?: string | null;
  requestedBrandId?: string | null;
}): Promise<{ id: string; name: string }> {
  if (boundBrandId && requestedBrandId && boundBrandId !== requestedBrandId) {
    throw new ServiceError('forbidden', 403, 'This API key is bound to a different brand');
  }

  const id = requestedBrandId ?? boundBrandId ?? null;
  if (id) {
    const brand = await getActiveBrandById(id, orgId);
    if (!brand) throw new ServiceError('not_found', 404, 'Brand not found');
    return { id: brand.id, name: brand.name };
  }

  const brands = await listActiveBrands(orgId);
  if (brands.length === 1) return { id: brands[0].id, name: brands[0].name };
  if (brands.length === 0) throw new ServiceError('not_found', 404, 'Brand not found');

  const error = 'brand_id is required: this organization has several brands';
  throw new ServiceError('brand_required', 400, error, {
    error,
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
  });
}

/** ToolContext del chat del dashboard: todos los scopes, el rol de la sesión. */
export function chatToolContext({
  auth,
  brandId,
  language,
  conversationId,
  turnId,
  timezone,
  tainted,
}: {
  auth: JWTPayload;
  brandId: string;
  language: 'es' | 'en';
  conversationId?: string;
  turnId?: string;
  timezone?: string;
  tainted: boolean;
}): ToolContext {
  return {
    auth,
    brandId,
    language,
    brandScope: 'strict',
    orgId: auth.orgId,
    userId: auth.userId,
    role: auth.role,
    plan: auth.plan,
    source: 'chat',
    scopes: ['read', 'write', 'publish'],
    conversationId,
    turnId,
    timezone,
    turn: { tainted, pausedInMessage: false },
  };
}

// buildWorkspaceSnapshot(ctx) vive en lib/assistant/tools/workspace.ts (se
// reexporta desde lib/assistant/tools): depende de los servicios extraídos y
// reexportarlo aquí crearía un ciclo context → tools → registry → context.
