// ─── Herramientas del asistente: espacio de trabajo ──────────────────────────
//
// get_workspace_context (lo que el modelo necesita saber antes de actuar) y
// open_page (navegación del dashboard, solo chat).
//
// buildWorkspaceSnapshot vive aquí porque depende de los servicios extraídos
// (marcas, estrategia, inbox). El chat reutiliza la misma función para la
// <workspace_snapshot> de cada mensaje.

import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { getUsage } from '@/lib/usage';
import { getEntitlement } from '@/lib/subscription';
import { reportError } from '@/lib/observability';
import { defineTool } from '@/lib/assistant/registry';
import { buildDashboardHref, DASHBOARD_PAGES, type DashboardPage } from '@/lib/assistant/links';
import type { ToolContext } from '@/lib/assistant/types';
import { listBrands } from '@/lib/services/brands';
import { getOrgStrategy } from '@/lib/services/strategy';
import { getInboxSummary } from '@/lib/services/inbox';

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export interface WorkspaceSnapshot {
  org: { name: string | null; plan: string };
  brand: { id: string; name: string | null };
  brands: { id: string; name: string }[];
  role: string;
  subscription: { canCreate: boolean; status: string; trialDaysLeft: number | null } | null;
  credits: { used: number; limit: number; remaining: number } | null;
  strategy: { objective: string | null; industry: string | null; framework: string | null } | null;
  connected_accounts: number | null;
  inbox: { unread_dms: number; unreplied_comments: number } | null;
}

/**
 * Cada parte del snapshot es independiente: si una consulta falla se reporta y
 * esa parte queda en null, en vez de dejar al modelo sin contexto.
 */
async function part<T>(ctx: ToolContext, name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    reportError(err, { route: 'lib/assistant/tools/workspace', auth: ctx.auth, extra: { part: name } });
    return null;
  }
}

/**
 * Contexto compacto de la organización y la marca activa. Con una API key atada
 * a una marca, `brands` solo contiene esa marca.
 */
export async function buildWorkspaceSnapshot(ctx: ToolContext): Promise<WorkspaceSnapshot> {
  const db = createSupabaseServer();

  const [org, brandList, entitlement, strategy, connectedAccounts, inbox] = await Promise.all([
    part(ctx, 'org', async () => {
      const { data } = await db
        .from('kefy_organizations')
        .select('name, plan')
        .eq('id', ctx.orgId)
        .maybeSingle();
      return data as { name: string | null; plan: string | null } | null;
    }),
    part(ctx, 'brands', () => listBrands(ctx, { onlyBrandId: ctx.boundBrandId ?? undefined })),
    part(ctx, 'subscription', () => getEntitlement(ctx.orgId)),
    part(ctx, 'strategy', () => getOrgStrategy(ctx)),
    part(ctx, 'accounts', async () => {
      const { count, error } = await db
        .from('kefy_social_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .eq('brand_id', ctx.brandId)
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      return count ?? 0;
    }),
    part(ctx, 'inbox', () => getInboxSummary(ctx)),
  ]);

  // El plan de la organización manda: el del JWT puede ser de antes de un cambio.
  const plan = org?.plan ?? ctx.plan;
  const usage = await part(ctx, 'credits', () => getUsage(ctx.orgId, plan));

  const brands = (brandList?.brands ?? []).map((b) => ({ id: b.id, name: b.name }));
  const activeBrand = brands.find((b) => b.id === ctx.brandId);

  return {
    org: { name: org?.name ?? null, plan },
    brand: { id: ctx.brandId, name: activeBrand?.name ?? null },
    brands,
    role: ctx.role,
    subscription: entitlement
      ? { canCreate: entitlement.canCreate, status: entitlement.status, trialDaysLeft: entitlement.trialDaysLeft }
      : null,
    credits: usage ? { used: usage.used, limit: usage.limit, remaining: usage.remaining } : null,
    strategy: strategy?.selection && strategy.names ? strategy.names : null,
    connected_accounts: connectedAccounts,
    inbox,
  };
}

// ─── get_workspace_context ───────────────────────────────────────────────────

const getWorkspaceContextTool = defineTool({
  name: 'get_workspace_context',
  title: { es: 'Ver contexto del espacio de trabajo', en: 'Get workspace context' },
  kind: 'read',
  description:
    'Returns the organization, active brand, available brands, caller role, plan, subscription state, remaining AI credits, ' +
    'active strategy, number of connected social accounts, and unread DM / unreplied comment counts. ' +
    'Call it first when you need to plan an action or pick a brand. Costs no credits.',
  input: z.object({}).strict(),
  confirm: 'never',
  handler: async (ctx) => ({ data: await buildWorkspaceSnapshot(ctx) }),
});

// ─── open_page ────────────────────────────────────────────────────────────────

const openPageInput = z.object({
  page: z.enum(DASHBOARD_PAGES as [DashboardPage, ...DashboardPage[]]),
  item_id: z.string().uuid().optional(),
  topic: z.string().max(500).optional(),
  type: z.enum(['post', 'carousel', 'reel', 'story']).optional(),
  thread_id: z.string().max(200).optional(),
  account_id: z.string().uuid().optional(),
  tab: z.enum(['dms', 'comments']).optional(),
}).strict();

const openPageTool = defineTool({
  name: 'open_page',
  title: { es: 'Abrir página', en: 'Open page' },
  kind: 'read',
  sources: ['chat'],
  description:
    "Navigates the user's dashboard to a page. Use content_create with item_id to open a content item, or with topic/type " +
    'to pre-fill the creator; use conversations with tab, thread_id and account_id to open a DM thread. Costs no credits.',
  input: openPageInput,
  confirm: 'never',
  handler: async (ctx, input) => {
    // El href lo construye siempre el servidor a partir de la página y los
    // parámetros validados: nunca sale del texto del modelo.
    const href = buildDashboardHref(ctx.language, input.page, {
      item: input.item_id,
      topic: input.topic,
      type: input.type,
      tab: input.tab,
      thread: input.thread_id,
      account: input.account_id,
    });
    return { data: { href }, uiAction: { type: 'navigate', href } };
  },
});

export const workspaceTools = [getWorkspaceContextTool, openPageTool];
