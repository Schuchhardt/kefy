// ─── Administración: marca de demostración para un prospecto ─────────────────
//
// Lo propio de Kefy al vender: en vez de describir el producto, se le muestra
// al prospecto su negocio ya hecho. createDemoBrand crea una marca en la
// organización de demos (KEFY_DEMO_ORG_ID), lee su web y escribe 3 posts con
// los mismos servicios que el onboarding (createBrand + createStarterPosts), y
// la deja enlazada al lead. createDemoPreviewLink genera un link público de
// solo lectura (app/[lang]/demo/[token]) que vence y se puede revocar.
//
// Los créditos se cobran a la organización de demos, como cualquier uso: si se
// acaban, createStarterPosts responde credits_exhausted. NADA se envía al
// prospecto: el dueño le pasa el link a mano.
//
// Ver docs/admin-mcp.md.

import { randomBytes } from 'node:crypto';
import { ServiceError } from '@/lib/services/errors';
import { serviceContext, type ServiceContext } from '@/lib/services/context';
import { createBrand } from '@/lib/services/brands';
import { createStarterPosts } from '@/lib/services/onboarding';
import { absoluteUrl } from '@/lib/app-url';
import { hashPreviewToken } from '@/lib/services/demo-preview';
import { db, rowsOrThrow } from '@/lib/services/admin/platform';
import { normalizeDomain } from '@/lib/services/admin/sales-leads';
import type { AdminContext } from '@/lib/services/admin/context';
import type { ContentChannel } from '@/types/ai';
import type { JWTPayload } from '@/types/auth';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEMO_PREVIEW_DEFAULT_DAYS = 14;
export const DEMO_PREVIEW_MAX_DAYS = 90;

export function demoOrgId(): string | null {
  return process.env.KEFY_DEMO_ORG_ID?.trim() || null;
}

/**
 * Contexto de servicio que actúa como el dueño de la organización de demos:
 * así createBrand respeta su tope de marcas y los créditos salen de ella.
 */
async function demoContext(brandId: string, language: 'es' | 'en'): Promise<ServiceContext> {
  const orgId = demoOrgId();
  if (!orgId) {
    throw new ServiceError('unavailable', 503, 'Demo brands are not configured: set KEFY_DEMO_ORG_ID to the demo organization id.');
  }
  const [org, owner] = await Promise.all([
    db().from('kefy_organizations').select('id, plan').eq('id', orgId).maybeSingle(),
    db().from('kefy_org_memberships').select('user_id').eq('org_id', orgId).eq('role', 'owner').limit(1),
  ]);
  if (!org.data) throw new ServiceError('unavailable', 503, 'KEFY_DEMO_ORG_ID does not match any organization.');
  const ownerId = rowsOrThrow(owner, 'demo org owner')[0]?.user_id as string | undefined;
  if (!ownerId) throw new ServiceError('unavailable', 503, 'The demo organization has no owner.');
  const auth: JWTPayload = { userId: ownerId, orgId, role: 'owner', plan: (org.data as Row).plan ?? 'starter' };
  return serviceContext(auth, brandId, language, { brandScope: 'strict', source: 'mcp' });
}

async function loadLead(leadId: string): Promise<Row> {
  const lead = rowsOrThrow(await db().from('kefy_sales_leads')
    .select('id, name, company, website, demo_brand_id').eq('id', leadId).limit(1), 'lead')[0];
  if (!lead) throw new ServiceError('not_found', 404, 'Lead not found');
  return lead;
}

/** La marca demo del lead si sigue viva en la organización de demos. */
async function liveDemoBrand(lead: Row): Promise<Row | null> {
  if (!lead.demo_brand_id) return null;
  const orgId = demoOrgId();
  const brand = rowsOrThrow(await db().from('kefy_brands').select('id, name, org_id, archived')
    .eq('id', lead.demo_brand_id).limit(1), 'demo brand')[0];
  return brand && !brand.archived && brand.org_id === orgId ? brand : null;
}

export async function createDemoBrand(ctx: AdminContext, input: {
  lead_id: string; url?: string; description?: string; brand_name?: string; channel: ContentChannel; language: 'es' | 'en';
}) {
  const lead = await loadLead(input.lead_id);
  const url = input.url?.trim() || lead.website || null;
  const description = input.description?.trim() || null;
  if (!url && !description) {
    throw new ServiceError('invalid_input', 422, 'The lead has no website: pass url or a one-sentence description.');
  }

  // Si ya tiene una marca demo con posts no se crea otra; si quedó vacía (falló
  // la generación) se reintenta sobre la misma.
  let brand = await liveDemoBrand(lead);
  if (brand) {
    const { count } = await db().from('kefy_content_items').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id);
    if ((count ?? 0) > 0) {
      throw new ServiceError('conflict', 409,
        `This lead already has a demo brand with content (${brand.id}). Use create_demo_preview_link to share it.`);
    }
  } else {
    const name = (input.brand_name?.trim() || lead.company || lead.name || normalizeDomain(url) || 'Demo').slice(0, 100);
    brand = (await createBrand(await demoContext('', input.language), { name })).brand as Row;
    await db().from('kefy_sales_leads').update({ demo_brand_id: brand.id, updated_at: ctx.now.toISOString() }).eq('id', lead.id);
  }

  const out = await createStarterPosts(await demoContext(brand.id, input.language), {
    url, description, channel: input.channel,
  });

  await db().from('kefy_sales_lead_activities').insert({
    lead_id: lead.id, type: 'note', created_by: ctx.adminEmail,
    body: `Demo brand "${out.brandName}" created with ${out.posts.length} post(s)${out.websiteError ? ' (website unreadable)' : ''}.`,
  });

  return {
    brand: { id: brand.id, name: out.brandName, org_id: demoOrgId() },
    filled: out.filled,
    failed: out.failed,
    website_error: out.websiteError ?? null,
    posts: out.posts.map((p) => ({ item_id: p.id, angle: p.angle, body: p.body, hashtags: p.hashtags })),
    next: 'Call create_demo_preview_link to get a public link for the prospect.',
  };
}

export async function createDemoPreviewLink(ctx: AdminContext, input: {
  lead_id: string; expires_in_days: number; language: 'es' | 'en';
}) {
  const lead = await loadLead(input.lead_id);
  const brand = await liveDemoBrand(lead);
  if (!brand) throw new ServiceError('conflict', 409, 'This lead has no demo brand yet: call create_demo_brand first.');

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(ctx.now.getTime() + input.expires_in_days * DAY_MS).toISOString();
  const row = rowsOrThrow(await db().from('kefy_demo_previews').insert({
    lead_id: lead.id, brand_id: brand.id, token_hash: hashPreviewToken(token), token_prefix: token.slice(0, 6),
    lang: input.language, expires_at: expiresAt, created_by: ctx.adminEmail,
  }).select('id, token_prefix, expires_at'), 'demo preview')[0];

  return {
    preview: { id: row.id, url: absoluteUrl(`/${input.language}/demo/${token}`), expires_at: row.expires_at },
    note: 'The URL is shown only this once (only its hash is stored). Create a new link if it gets lost; revoke old ones with '
      + 'revoke_demo_preview_link.',
  };
}

export async function revokeDemoPreviewLink(ctx: AdminContext, input: { preview_id: string }) {
  const rows = rowsOrThrow(await db().from('kefy_demo_previews').update({ revoked_at: ctx.now.toISOString() })
    .eq('id', input.preview_id).is('revoked_at', null).select('id, lead_id, revoked_at'), 'revoke preview');
  if (!rows[0]) throw new ServiceError('not_found', 404, 'Preview link not found or already revoked');
  return { revoked: rows[0] };
}

/** Marca demo y links de un lead, para get_sales_lead. Nunca devuelve tokens. */
export async function demoSummary(ctx: AdminContext, lead: Row) {
  if (!lead.demo_brand_id) return null;
  const [brand, previews, content] = await Promise.all([
    db().from('kefy_brands').select('id, name, archived').eq('id', lead.demo_brand_id).maybeSingle(),
    db().from('kefy_demo_previews').select('id, token_prefix, lang, expires_at, revoked_at, views, last_viewed_at, created_at')
      .eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(20),
    db().from('kefy_content_items').select('id', { count: 'exact', head: true }).eq('brand_id', lead.demo_brand_id),
  ]);
  return {
    brand: brand.data ? { id: (brand.data as Row).id, name: (brand.data as Row).name, archived: (brand.data as Row).archived } : null,
    content_items: content.count ?? 0,
    preview_links: rowsOrThrow(previews, 'previews').map((p) => ({
      ...p,
      active: !p.revoked_at && new Date(p.expires_at).getTime() > ctx.now.getTime(),
    })),
  };
}
