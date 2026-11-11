// ─── Administración: pipeline comercial de Kefy ──────────────────────────────
//
// A quién ofrecerle la plataforma y/o el servicio de gestión de cuentas y
// creación de contenido automatizado. Dos orígenes:
//
//   * kefy_account: organizaciones que ya usan Kefy. findAccountLeadCandidates
//     las segmenta (trial por vencer, trial vencido sin pagar, pago fallido,
//     cancelada, estancada, cerca del tope de créditos) y sugiere la oferta;
//     importAccountLeads las pasa al pipeline.
//   * outreach: prospección en frío que el admin (o su agente) carga por MCP
//     con upsertOutreachLeads, deduplicando por email, Instagram y dominio
//     del sitio. Cada prospecto lleva su ficha: contactos con la URL de donde
//     salió el dato, señales (por qué es buen prospecto) y la URL de origen.
//
// NADA se envía desde aquí: el dueño escribe a mano y registra el contacto con
// logSalesActivity. Las supresiones («no me escriban más») marcan el lead como
// no contactable y bloquean volver a cargarlo.
//
// No confundir con kefy_leads (lib/services/leads.ts): esos son los leads de
// la marca de cada cliente, salidos de sus comentarios y DMs.
//
// Ver docs/admin-mcp.md.

import { ServiceError } from '@/lib/services/errors';
import { PLAN_LIMITS, PLAN_PRICES_USD, isBillingPlan } from '@/lib/plans';
import { usagePeriod } from '@/lib/usage';
import { db, rowsOrThrow, safeQuery, subscriptionSummary } from '@/lib/services/admin/platform';
import type { AdminContext } from '@/lib/services/admin/context';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const DAY_MS = 24 * 60 * 60 * 1000;

export const LEAD_STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won', 'lost'] as const;
export const LEAD_OFFERS = ['platform', 'managed_service', 'both'] as const;
export const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const;
export const ACTIVITY_TYPES = ['note', 'email', 'call', 'whatsapp', 'dm', 'meeting', 'other'] as const;
export const ACCOUNT_SEGMENTS = [
  'trial_ending', 'trial_expired', 'payment_failed', 'canceled', 'stalled', 'near_credit_limit',
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadOffer = (typeof LEAD_OFFERS)[number];
export type AccountSegment = (typeof ACCOUNT_SEGMENTS)[number];

const LEAD_COLUMNS = 'id, kind, org_id, name, company, email, phone, website, instagram, social_links, city, country, '
  + 'industry, followers, source, segment, offer, stage, priority, estimated_value_usd, next_action, next_action_at, '
  + 'last_contacted_at, lost_reason, tags, notes, created_by, created_at, updated_at, domain, source_url, contacts, signals, '
  + 'sequence_step';

export const MAX_CONTACTS = 20;
export const MAX_SIGNALS = 50;
export const MAX_SEQUENCE_STEP = 20;

// ─── Normalización ───────────────────────────────────────────────────────────

export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** «@Marca.CL», «instagram.com/marca.cl/» → «marca.cl». */
export function normalizeInstagram(v: string | null | undefined): string | null {
  let h = (v ?? '').trim().toLowerCase();
  if (!h) return null;
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').split(/[/?#]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

export function normalizePhone(v: string | null | undefined): string | null {
  const p = (v ?? '').replace(/[^\d+]/g, '');
  return p.length >= 7 ? p : null;
}

export function normalizeWebsite(v: string | null | undefined): string | null {
  const w = (v ?? '').trim();
  if (!w) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

// Hosts que comparten muchos negocios: no sirven para identificar a uno.
const SHARED_HOSTS = [
  'instagram.com', 'facebook.com', 'fb.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'x.com', 'twitter.com',
  'linkedin.com', 'linktr.ee', 'beacons.ai', 'bio.link', 'linkin.bio', 'wa.me', 'whatsapp.com',
  'google.com', 'goo.gl', 'g.page', 'business.site', 'canva.site', 'taplink.cc', 'bit.ly',
  'pedidosya.com', 'rappi.com', 'ubereats.com', 'mercadolibre.cl', 'mercadolibre.com',
];

/** «https://www.Marca.cl/contacto» → «marca.cl». Null para hosts compartidos (linktr.ee, instagram.com…). */
export function normalizeDomain(v: string | null | undefined): string | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (SHARED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return host;
}

// ─── Ficha: contactos y señales ──────────────────────────────────────────────

export interface ProspectContactInput {
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  source_url?: string | null;
  note?: string | null;
}

export interface ProspectSignalInput {
  type: string;
  detail?: string | null;
  source_url?: string | null;
  observed_at?: string | null;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

/** Contacto normalizado, o null si no trae ni nombre ni forma de contacto. */
export function normalizeContact(c: ProspectContactInput): Row | null {
  const out: Row = {
    name: clean(c.name),
    role: clean(c.role),
    email: normalizeEmail(c.email),
    phone: normalizePhone(c.phone),
    instagram: normalizeInstagram(c.instagram),
    linkedin: clean(c.linkedin),
    source_url: clean(c.source_url),
    note: clean(c.note),
  };
  if (!out.name && !out.email && !out.phone && !out.instagram && !out.linkedin) return null;
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return out;
}

function contactKey(c: Row): string {
  if (c.email) return `e:${c.email}`;
  if (c.phone) return `p:${c.phone}`;
  if (c.instagram) return `i:${c.instagram}`;
  if (c.linkedin) return `l:${String(c.linkedin).toLowerCase()}`;
  return `n:${String(c.name ?? '').toLowerCase()}`;
}

/** Suma contactos nuevos a los existentes; uno repetido solo completa sus campos vacíos. */
export function mergeContacts(existing: Row[] | null | undefined, incoming: ProspectContactInput[] | undefined): Row[] {
  const out = (existing ?? []).map((c) => ({ ...c }));
  for (const raw of incoming ?? []) {
    const c = normalizeContact(raw);
    if (!c) continue;
    const prev = out.find((o) => contactKey(o) === contactKey(c));
    if (prev) {
      for (const [k, v] of Object.entries(c)) if (prev[k] === undefined || prev[k] === null) prev[k] = v;
    } else if (out.length < MAX_CONTACTS) {
      out.push(c);
    }
  }
  return out;
}

/** Suma señales nuevas (mismo type + detail = repetida), con fecha de observación. */
export function mergeSignals(existing: Row[] | null | undefined, incoming: ProspectSignalInput[] | undefined, now: Date): Row[] {
  const out = (existing ?? []).map((sg) => ({ ...sg }));
  const key = (sg: Row) => `${String(sg.type).toLowerCase()}|${String(sg.detail ?? '').toLowerCase()}`;
  for (const raw of incoming ?? []) {
    const type = clean(raw.type);
    if (!type) continue;
    const sig: Row = { type, observed_at: raw.observed_at ?? now.toISOString() };
    const detail = clean(raw.detail);
    const sourceUrl = clean(raw.source_url);
    if (detail) sig.detail = detail;
    if (sourceUrl) sig.source_url = sourceUrl;
    if (out.some((o) => key(o) === key(sig))) continue;
    if (out.length < MAX_SIGNALS) out.push(sig);
  }
  return out;
}

// ─── Supresiones ─────────────────────────────────────────────────────────────

export interface Suppressions {
  emails: Set<string>;
  domains: Set<string>;
  phones: Set<string>;
  instagrams: Set<string>;
}

export async function loadSuppressions(): Promise<Suppressions> {
  const rows = rowsOrThrow(await db().from('kefy_sales_suppressions').select('kind, value'), 'suppressions');
  const s: Suppressions = { emails: new Set(), domains: new Set(), phones: new Set(), instagrams: new Set() };
  for (const r of rows) {
    if (r.kind === 'email') s.emails.add(r.value);
    else if (r.kind === 'domain') s.domains.add(r.value);
    else if (r.kind === 'phone') s.phones.add(r.value);
    else if (r.kind === 'instagram') s.instagrams.add(r.value);
  }
  return s;
}

/** Motivo por el que no se puede contactar, o null. */
export function suppressionReason(lead: Row, s: Suppressions): string | null {
  const email = normalizeEmail(lead.email);
  if (email && s.emails.has(email)) return 'email_suppressed';
  if (email && s.domains.has(email.split('@')[1])) return 'domain_suppressed';
  const phone = normalizePhone(lead.phone);
  if (phone && s.phones.has(phone)) return 'phone_suppressed';
  const ig = normalizeInstagram(lead.instagram);
  if (ig && s.instagrams.has(ig)) return 'instagram_suppressed';
  const domain = lead.domain ?? normalizeDomain(lead.website);
  if (domain && s.domains.has(domain)) return 'domain_suppressed';
  return null;
}

function withContactable(lead: Row, s: Suppressions) {
  const blocked = suppressionReason(lead, s);
  // Un contacto suprimido por su propio email/teléfono/Instagram no bloquea al resto de la empresa.
  const contacts = Array.isArray(lead.contacts)
    ? lead.contacts.map((c: Row) => {
      const reason = blocked ?? suppressionReason({ email: c.email, phone: c.phone, instagram: c.instagram }, s);
      return reason ? { ...c, blocked_reason: reason } : c;
    })
    : lead.contacts;
  return { ...lead, contacts, contactable: !blocked && lead.stage !== 'won' && lead.stage !== 'lost', blocked_reason: blocked };
}

// ─── Listar y ver ────────────────────────────────────────────────────────────

export async function listSalesLeads(ctx: AdminContext, input: {
  stage?: LeadStage[]; offer?: LeadOffer; kind?: 'kefy_account' | 'outreach'; query?: string; tag?: string;
  due_only?: boolean; contactable_only?: boolean; limit: number; offset: number;
}) {
  let q = db().from('kefy_sales_leads').select(LEAD_COLUMNS);
  if (input.stage?.length) q = q.in('stage', input.stage);
  if (input.offer) q = q.eq('offer', input.offer);
  if (input.kind) q = q.eq('kind', input.kind);
  if (input.tag) q = q.contains('tags', [input.tag]);
  if (input.due_only) {
    q = q.lte('next_action_at', ctx.now.toISOString()).not('stage', 'in', '(won,lost)');
  }
  const text = input.query ? safeQuery(input.query) : '';
  if (text) {
    q = q.or(['name', 'company', 'email', 'instagram', 'website', 'domain', 'city', 'industry'].map((c) => `${c}.ilike.%${text}%`).join(','));
  }
  q = input.due_only
    ? q.order('next_action_at', { ascending: true })
    : q.order('updated_at', { ascending: false });

  const rows = rowsOrThrow(await q.range(input.offset, input.offset + input.limit), 'leads');
  const s = await loadSuppressions();
  let leads = rows.slice(0, input.limit).map((r) => withContactable(r, s));
  if (input.contactable_only) leads = leads.filter((l) => l.contactable);
  return { leads, has_more: rows.length > input.limit };
}

export async function getSalesLead(ctx: AdminContext, input: { lead_id: string }) {
  const lead = rowsOrThrow(await db().from('kefy_sales_leads').select(LEAD_COLUMNS).eq('id', input.lead_id).limit(1), 'lead')[0];
  if (!lead) throw new ServiceError('not_found', 404, 'Lead not found');
  const [activities, s] = await Promise.all([
    db().from('kefy_sales_lead_activities').select('id, type, direction, sequence_step, contact_name, body, created_by, created_at')
      .eq('lead_id', input.lead_id).order('created_at', { ascending: false }).limit(50),
    loadSuppressions(),
  ]);
  let account: Row | null = null;
  if (lead.org_id) {
    const [org, sub] = await Promise.all([
      db().from('kefy_organizations').select('id, name, created_at').eq('id', lead.org_id).maybeSingle(),
      db().from('kefy_subscriptions').select('plan, status, current_period_end, stripe_subscription_id').eq('org_id', lead.org_id).maybeSingle(),
    ]);
    account = org.data ? { ...org.data, subscription: subscriptionSummary(sub.data as Row | null, ctx.now) } : null;
  }
  return { lead: withContactable(lead, s), activities: rowsOrThrow(activities, 'activities'), account };
}

export async function getSalesPipeline(ctx: AdminContext) {
  const rows = rowsOrThrow(await db().from('kefy_sales_leads')
    .select('id, stage, offer, kind, estimated_value_usd, next_action_at, name, company, next_action'), 'pipeline');
  const byStage: Record<string, number> = Object.fromEntries(LEAD_STAGES.map((st) => [st, 0]));
  const byOffer: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  let openValue = 0;
  let wonValue = 0;
  const due: Row[] = [];
  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    byOffer[r.offer ?? 'unset'] = (byOffer[r.offer ?? 'unset'] ?? 0) + 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    const v = Number(r.estimated_value_usd) || 0;
    if (r.stage === 'won') wonValue += v;
    else if (r.stage !== 'lost') openValue += v;
    if (r.next_action_at && r.stage !== 'won' && r.stage !== 'lost' && new Date(r.next_action_at).getTime() <= ctx.now.getTime()) {
      due.push(r);
    }
  }
  due.sort((a, b) => (a.next_action_at < b.next_action_at ? -1 : 1));
  return {
    total: rows.length,
    by_stage: byStage,
    by_offer: byOffer,
    by_kind: byKind,
    open_monthly_value_usd: openValue,
    won_monthly_value_usd: wonValue,
    follow_ups_due: due.slice(0, 20).map((r) => ({
      id: r.id, name: r.name, company: r.company, stage: r.stage, next_action: r.next_action, next_action_at: r.next_action_at,
    })),
  };
}

// ─── Cargar prospección en frío ──────────────────────────────────────────────

export interface OutreachLeadInput {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  social_links?: Record<string, string>;
  city?: string | null;
  country?: string | null;
  industry?: string | null;
  followers?: number | null;
  source?: string;
  offer?: LeadOffer | null;
  priority?: (typeof LEAD_PRIORITIES)[number];
  estimated_value_usd?: number | null;
  next_action?: string | null;
  next_action_at?: string | null;
  tags?: string[];
  notes?: string | null;
  source_url?: string | null;
  contacts?: ProspectContactInput[];
  signals?: ProspectSignalInput[];
}

/**
 * Crea o completa leads de prospección. Deduplica por email, Instagram y
 * dominio del sitio contra la base y dentro del mismo lote; un duplicado se completa (solo campos
 * vacíos y tags nuevas), nunca se pisa lo que ya había. Lo suprimido no entra.
 */
export async function upsertOutreachLeads(ctx: AdminContext, input: { leads: OutreachLeadInput[] }) {
  const s = await loadSuppressions();
  const created: Row[] = [];
  const updated: Row[] = [];
  const skipped: { index: number; reason: string }[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of input.leads.entries()) {
    const contacts = mergeContacts([], raw.contacts);
    // Sin email o teléfono propios, el lead toma los del primer contacto que los tenga.
    const email = normalizeEmail(raw.email) ?? contacts.find((c) => c.email)?.email ?? null;
    const instagram = normalizeInstagram(raw.instagram);
    const phone = normalizePhone(raw.phone) ?? contacts.find((c) => c.phone)?.phone ?? null;
    const website = normalizeWebsite(raw.website);
    const domain = normalizeDomain(raw.website);
    if (!email && !instagram && !phone && !website && contacts.length === 0) {
      skipped.push({ index, reason: 'no_contact: needs email, instagram, phone, website or a contact' });
      continue;
    }
    const keyParts = [email && `e:${email}`, instagram && `i:${instagram}`, domain && `d:${domain}`].filter(Boolean) as string[];
    if (keyParts.some((k) => seen.has(k))) { skipped.push({ index, reason: 'duplicate_in_batch' }); continue; }
    keyParts.forEach((k) => seen.add(k));

    const blocked = suppressionReason({ email, instagram, phone, domain }, s);
    if (blocked) { skipped.push({ index, reason: blocked }); continue; }
    const signals = mergeSignals([], raw.signals, ctx.now);

    const fields: Row = {
      name: raw.name?.trim() || null,
      company: raw.company?.trim() || null,
      email, phone, website, instagram, domain,
      source_url: raw.source_url?.trim() || null,
      social_links: raw.social_links ?? {},
      city: raw.city?.trim() || null,
      country: raw.country?.trim() || null,
      industry: raw.industry?.trim() || null,
      followers: raw.followers ?? null,
      offer: raw.offer ?? null,
      estimated_value_usd: raw.estimated_value_usd ?? null,
      next_action: raw.next_action ?? null,
      next_action_at: raw.next_action_at ?? null,
      notes: raw.notes ?? null,
    };

    const clauses = [
      email && `email.eq.${email}`, instagram && `instagram.eq.${instagram}`, domain && `domain.eq.${domain}`,
    ].filter(Boolean) as string[];
    const existing = clauses.length
      ? rowsOrThrow(await db().from('kefy_sales_leads').select(LEAD_COLUMNS).or(clauses.join(',')).limit(1), 'dedupe')[0]
      : undefined;

    if (existing) {
      const patch: Row = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v === null || v === undefined) continue;
        if (k === 'social_links') {
          const merged = { ...(v as Row), ...(existing.social_links ?? {}) };
          if (Object.keys(merged).length !== Object.keys(existing.social_links ?? {}).length) patch.social_links = merged;
        } else if (existing[k] === null || existing[k] === undefined || existing[k] === '') {
          patch[k] = v;
        }
      }
      const newTags = (raw.tags ?? []).filter((t) => !(existing.tags ?? []).includes(t));
      if (newTags.length) patch.tags = [...(existing.tags ?? []), ...newTags];
      const mergedContacts = mergeContacts(existing.contacts, raw.contacts);
      if (JSON.stringify(mergedContacts) !== JSON.stringify(existing.contacts ?? [])) patch.contacts = mergedContacts;
      const mergedSignals = mergeSignals(existing.signals, raw.signals, ctx.now);
      if (mergedSignals.length !== (existing.signals ?? []).length) patch.signals = mergedSignals;
      if (Object.keys(patch).length === 0) { skipped.push({ index, reason: `already_exists:${existing.id}` }); continue; }
      patch.updated_at = ctx.now.toISOString();
      const res = await db().from('kefy_sales_leads').update(patch).eq('id', existing.id).select('id, name, company, email, instagram, stage');
      // Completar el dominio o el email puede chocar con otro lead que ya los tiene.
      if (res.error?.code === '23505') { skipped.push({ index, reason: `conflicts_with_other_lead:${existing.id}` }); continue; }
      updated.push({ index, ...rowsOrThrow(res, 'update lead')[0], filled: Object.keys(patch).filter((k) => k !== 'updated_at') });
      continue;
    }

    const res = await db().from('kefy_sales_leads').insert({
      ...fields,
      kind: 'outreach',
      source: raw.source?.trim() || 'cold_outreach',
      priority: raw.priority ?? 'medium',
      tags: raw.tags ?? [],
      contacts,
      signals,
      created_by: ctx.adminEmail,
    }).select('id, name, company, email, instagram, stage');
    if (res.error?.code === '23505') { skipped.push({ index, reason: 'duplicate' }); continue; }
    created.push({ index, ...rowsOrThrow(res, 'insert lead')[0] });
  }

  return { created: created.length, updated: updated.length, skipped: skipped.length, details: { created, updated, skipped } };
}

// ─── Usuarios de Kefy como leads ─────────────────────────────────────────────

/** Segmento y oferta sugerida de una organización, o null si no es lead. Pura. */
export function classifyAccount(a: {
  sub: Row | null; now: Date; creditsUsed: number; plan: string;
  lastContentAt: string | null; activeSocialAccounts: number; createdAt: string;
}): { segment: AccountSegment; offer: LeadOffer; priority: 'low' | 'medium' | 'high'; why: string } | null {
  const sub = subscriptionSummary(a.sub, a.now);
  const ageDays = (a.now.getTime() - new Date(a.createdAt).getTime()) / DAY_MS;
  const idleDays = a.lastContentAt ? (a.now.getTime() - new Date(a.lastContentAt).getTime()) / DAY_MS : Infinity;
  const limit = isBillingPlan(a.plan) ? PLAN_LIMITS[a.plan].credits : PLAN_LIMITS.starter.credits;
  // Quien casi no generó nada o no conectó redes no va a sacar valor solo de la
  // plataforma: el servicio gestionado le resuelve el «no tengo tiempo».
  const lowUsage = a.activeSocialAccounts === 0 || idleDays > 14;

  if (sub.status === 'past_due' || sub.status === 'unpaid') {
    return { segment: 'payment_failed', offer: 'platform', priority: 'high', why: 'Card payment failed: creation is blocked.' };
  }
  if (sub.status === 'trialing' && !sub.can_create) {
    return {
      segment: 'trial_expired', offer: lowUsage ? 'managed_service' : 'platform', priority: lowUsage ? 'medium' : 'high',
      why: lowUsage ? 'Trial expired with little usage.' : 'Trial expired after real usage: likely to convert.',
    };
  }
  if (sub.status === 'trialing' && (sub.trial_days_left ?? 99) <= 7) {
    return {
      segment: 'trial_ending', offer: lowUsage ? 'both' : 'platform', priority: 'high',
      why: `Trial ends in ${sub.trial_days_left} day(s).`,
    };
  }
  if (sub.status === 'canceled') {
    return { segment: 'canceled', offer: 'managed_service', priority: 'low', why: 'Canceled the subscription.' };
  }
  if (sub.can_create && ageDays >= 7 && lowUsage) {
    return {
      segment: 'stalled', offer: 'managed_service', priority: 'medium',
      why: a.activeSocialAccounts === 0 ? 'No social account connected.' : `No content in ${Math.floor(idleDays)} days.`,
    };
  }
  if (sub.can_create && a.creditsUsed >= 0.8 * limit) {
    return {
      segment: 'near_credit_limit', offer: a.plan === 'business' ? 'managed_service' : 'platform', priority: 'medium',
      why: `Used ${a.creditsUsed}/${limit} credits this month: upgrade candidate.`,
    };
  }
  return null;
}

export async function findAccountLeadCandidates(ctx: AdminContext, input: { segments?: AccountSegment[]; include_existing: boolean; limit: number }) {
  const period = usagePeriod(ctx.now);
  const since = new Date(ctx.now.getTime() - 60 * DAY_MS).toISOString();
  const [orgs, subs, usage, content, accounts, leads, owners, s] = await Promise.all([
    db().from('kefy_organizations').select('id, name, plan, created_at').order('created_at', { ascending: false }).limit(2000),
    db().from('kefy_subscriptions').select('org_id, plan, status, current_period_end, stripe_subscription_id'),
    db().from('kefy_usage_counters').select('org_id, credits').eq('period', period),
    db().from('kefy_content_items').select('org_id, created_at').gte('created_at', since).order('created_at', { ascending: false }),
    db().from('kefy_social_accounts').select('org_id').eq('status', 'active'),
    db().from('kefy_sales_leads').select('id, org_id, stage').not('org_id', 'is', null),
    db().from('kefy_org_memberships').select('org_id, kefy_users(email, name)').eq('role', 'owner'),
    loadSuppressions(),
  ]);

  const subBy = new Map(rowsOrThrow(subs, 'subs').map((r) => [r.org_id, r]));
  const usageBy = new Map(rowsOrThrow(usage, 'usage').map((r) => [r.org_id, Number(r.credits) || 0]));
  const lastContent = new Map<string, string>();
  for (const r of rowsOrThrow(content, 'content')) if (!lastContent.has(r.org_id)) lastContent.set(r.org_id, r.created_at);
  const socialCount = new Map<string, number>();
  for (const r of rowsOrThrow(accounts, 'accounts')) socialCount.set(r.org_id, (socialCount.get(r.org_id) ?? 0) + 1);
  const leadBy = new Map(rowsOrThrow(leads, 'leads').map((r) => [r.org_id, r]));
  const ownerBy = new Map<string, Row>();
  for (const r of rowsOrThrow(owners, 'owners')) {
    const u = Array.isArray(r.kefy_users) ? r.kefy_users[0] : r.kefy_users;
    if (!ownerBy.has(r.org_id)) ownerBy.set(r.org_id, u ?? {});
  }

  const candidates: Row[] = [];
  for (const o of rowsOrThrow(orgs, 'orgs')) {
    const sub = subBy.get(o.id) ?? null;
    const plan = (sub?.plan ?? o.plan) as string;
    const c = classifyAccount({
      sub, now: ctx.now, creditsUsed: usageBy.get(o.id) ?? 0, plan,
      lastContentAt: lastContent.get(o.id) ?? null, activeSocialAccounts: socialCount.get(o.id) ?? 0, createdAt: o.created_at,
    });
    if (!c) continue;
    if (input.segments?.length && !input.segments.includes(c.segment)) continue;
    const existing = leadBy.get(o.id);
    if (existing && !input.include_existing) continue;
    const owner = ownerBy.get(o.id) ?? {};
    const blocked = suppressionReason({ email: owner.email }, s);
    candidates.push({
      org_id: o.id,
      org_name: o.name,
      owner_email: owner.email ?? null,
      owner_name: owner.name ?? null,
      plan,
      ...c,
      credits_used_this_month: usageBy.get(o.id) ?? 0,
      active_social_accounts: socialCount.get(o.id) ?? 0,
      last_content_at: lastContent.get(o.id) ?? null,
      existing_lead: existing ? { id: existing.id, stage: existing.stage } : null,
      contactable: !blocked,
      blocked_reason: blocked,
    });
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  candidates.sort((a, b) => order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order]);
  return { total: candidates.length, candidates: candidates.slice(0, input.limit) };
}

export async function importAccountLeads(ctx: AdminContext, input: {
  org_ids: string[]; offer?: LeadOffer; next_action?: string; next_action_at?: string; tags?: string[];
}) {
  const { candidates } = await findAccountLeadCandidates(ctx, { include_existing: true, limit: 5000 });
  const byOrg = new Map(candidates.map((c) => [c.org_id, c]));
  const created: Row[] = [];
  const skipped: { org_id: string; reason: string }[] = [];

  for (const orgId of input.org_ids) {
    const c = byOrg.get(orgId);
    if (!c) { skipped.push({ org_id: orgId, reason: 'not_a_candidate_now' }); continue; }
    if (c.existing_lead) { skipped.push({ org_id: orgId, reason: `already_lead:${c.existing_lead.id}` }); continue; }
    if (!c.contactable) { skipped.push({ org_id: orgId, reason: c.blocked_reason }); continue; }
    const plan = c.plan as string;
    const res = await db().from('kefy_sales_leads').insert({
      kind: 'kefy_account',
      org_id: orgId,
      name: c.owner_name,
      company: c.org_name,
      email: normalizeEmail(c.owner_email),
      source: 'kefy_account',
      segment: c.segment,
      offer: input.offer ?? c.offer,
      priority: c.priority,
      estimated_value_usd: isBillingPlan(plan) ? PLAN_PRICES_USD[plan] : null,
      next_action: input.next_action ?? null,
      next_action_at: input.next_action_at ?? null,
      tags: input.tags ?? [],
      notes: c.why,
      created_by: ctx.adminEmail,
    }).select('id, org_id, company, email, segment, offer');
    // Mismo email ya cargado como prospección: se enlaza en vez de duplicar.
    if (res.error?.code === '23505') { skipped.push({ org_id: orgId, reason: 'email_already_lead' }); continue; }
    created.push(rowsOrThrow(res, 'insert account lead')[0]);
  }
  return { created: created.length, skipped: skipped.length, details: { created, skipped } };
}

// ─── Avanzar el pipeline ─────────────────────────────────────────────────────

export async function updateSalesLead(ctx: AdminContext, input: {
  lead_id: string; stage?: LeadStage; offer?: LeadOffer | null; priority?: (typeof LEAD_PRIORITIES)[number];
  estimated_value_usd?: number | null; next_action?: string | null; next_action_at?: string | null;
  lost_reason?: string | null; tags?: string[]; notes?: string | null;
  name?: string | null; company?: string | null; email?: string | null; phone?: string | null;
  website?: string | null; instagram?: string | null; city?: string | null; country?: string | null;
  industry?: string | null; source_url?: string | null;
  add_contacts?: ProspectContactInput[]; remove_contacts?: string[]; add_signals?: ProspectSignalInput[];
}) {
  const current = rowsOrThrow(await db().from('kefy_sales_leads').select('id, stage, contacts, signals')
    .eq('id', input.lead_id).limit(1), 'lead')[0];
  if (!current) throw new ServiceError('not_found', 404, 'Lead not found');

  const { lead_id: _id, add_contacts, remove_contacts, add_signals, ...rest } = input;
  const patch: Row = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
  if ('email' in patch) patch.email = normalizeEmail(patch.email);
  if ('instagram' in patch) patch.instagram = normalizeInstagram(patch.instagram);
  if ('phone' in patch) patch.phone = normalizePhone(patch.phone);
  if ('website' in patch) {
    patch.domain = normalizeDomain(patch.website);
    patch.website = normalizeWebsite(patch.website);
  }
  if (add_contacts?.length || remove_contacts?.length) {
    // Se quita por email, teléfono, Instagram o nombre exacto.
    const drop = new Set((remove_contacts ?? []).map((v) => v.trim().toLowerCase().replace(/^@/, '')));
    const kept = (current.contacts ?? []).filter((c: Row) => ![c.email, c.phone, c.instagram, c.name]
      .some((v) => v && drop.has(String(v).toLowerCase())));
    patch.contacts = mergeContacts(kept, add_contacts);
  }
  if (add_signals?.length) patch.signals = mergeSignals(current.signals, add_signals, ctx.now);
  if (input.stage === 'lost' && !input.lost_reason) {
    throw new ServiceError('invalid_input', 422, 'lost_reason is required when the stage is lost');
  }
  if (Object.keys(patch).length === 0) throw new ServiceError('invalid_input', 422, 'Nothing to update');
  patch.updated_at = ctx.now.toISOString();

  const res = await db().from('kefy_sales_leads').update(patch).eq('id', input.lead_id).select(LEAD_COLUMNS);
  if (res.error?.code === '23505') throw new ServiceError('conflict', 409, 'Another lead already has that email, Instagram or domain');
  const lead = rowsOrThrow(res, 'update lead')[0];

  if (input.stage && input.stage !== current.stage) {
    await db().from('kefy_sales_lead_activities').insert({
      lead_id: input.lead_id, type: 'stage_change', body: `${current.stage} → ${input.stage}`
        + (input.lost_reason ? ` (${input.lost_reason})` : ''), created_by: ctx.adminEmail,
    });
  }
  return { lead };
}

export async function logSalesActivity(ctx: AdminContext, input: {
  lead_id: string; type: (typeof ACTIVITY_TYPES)[number]; direction?: 'outbound' | 'inbound'; body?: string;
  stage?: LeadStage; next_action?: string | null; next_action_at?: string | null;
  sequence_step?: number; contact_name?: string;
}) {
  const lead = rowsOrThrow(await db().from('kefy_sales_leads')
    .select('id, stage, email, phone, instagram, website, domain, sequence_step').eq('id', input.lead_id).limit(1), 'lead')[0];
  if (!lead) throw new ServiceError('not_found', 404, 'Lead not found');

  const contact = input.type !== 'note';
  if (contact && input.direction !== 'inbound') {
    const blocked = suppressionReason(lead, await loadSuppressions());
    if (blocked) throw new ServiceError('conflict', 409, `This lead asked not to be contacted (${blocked}).`);
  }

  const act = rowsOrThrow(await db().from('kefy_sales_lead_activities').insert({
    lead_id: input.lead_id, type: input.type, direction: input.direction ?? null, body: input.body ?? null,
    sequence_step: input.sequence_step ?? null, contact_name: input.contact_name?.trim() || null, created_by: ctx.adminEmail,
  }).select('id, type, direction, sequence_step, contact_name, body, created_at'), 'activity')[0];

  const patch: Row = { updated_at: ctx.now.toISOString() };
  if (contact) patch.last_contacted_at = ctx.now.toISOString();
  // El lead guarda el paso más avanzado de la secuencia, aunque uno anterior se registre tarde.
  const prevStep = Number(lead.sequence_step) || 0;
  const step = Math.max(prevStep, input.sequence_step ?? 0);
  if (step !== prevStep) patch.sequence_step = step;
  // Primer contacto saliente: el lead pasa solo de «new» a «contacted»;
  // una respuesta entrante lo lleva a «replied».
  let stage = input.stage;
  if (!stage && contact && input.direction !== 'inbound' && lead.stage === 'new') stage = 'contacted';
  if (!stage && contact && input.direction === 'inbound' && (lead.stage === 'new' || lead.stage === 'contacted')) stage = 'replied';
  if (stage) patch.stage = stage;
  if (input.next_action !== undefined) patch.next_action = input.next_action;
  if (input.next_action_at !== undefined) patch.next_action_at = input.next_action_at;
  await db().from('kefy_sales_leads').update(patch).eq('id', input.lead_id);
  if (stage && stage !== lead.stage) {
    await db().from('kefy_sales_lead_activities').insert({
      lead_id: input.lead_id, type: 'stage_change', body: `${lead.stage} → ${stage}`, created_by: ctx.adminEmail,
    });
  }
  return { activity: act, stage: stage ?? lead.stage, sequence_step: step };
}

export function normalizeSuppression(kind: 'email' | 'domain' | 'phone' | 'instagram', raw: string): string | null {
  const v = raw.trim();
  if (kind === 'email') return normalizeEmail(v);
  if (kind === 'phone') return normalizePhone(v);
  if (kind === 'instagram') return normalizeInstagram(v);
  const d = v.replace(/^@/, '').replace(/^https?:\/\//i, '').split(/[/?#:]/)[0].toLowerCase().replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export async function addSuppression(ctx: AdminContext, input: {
  kind: 'email' | 'domain' | 'phone' | 'instagram'; value: string; reason?: string;
}) {
  const kind = input.kind;
  const value = normalizeSuppression(kind, input.value);
  if (!value) throw new ServiceError('invalid_input', 422, `Not a valid ${kind}`);

  const res = await db().from('kefy_sales_suppressions')
    .upsert({ kind, value, reason: input.reason ?? null, created_by: ctx.adminEmail }, { onConflict: 'kind,value', ignoreDuplicates: true })
    .select('id, kind, value');
  rowsOrThrow(res, 'suppression');

  // Los leads que coinciden quedan como perdidos para que nadie los retome.
  const column = kind === 'domain' ? null : kind;
  let affected: Row[] = [];
  if (column) {
    affected = rowsOrThrow(await db().from('kefy_sales_leads')
      .update({ stage: 'lost', lost_reason: 'do_not_contact', next_action: null, next_action_at: null, updated_at: ctx.now.toISOString() })
      .eq(column, value).not('stage', 'in', '(won,lost)').select('id'), 'suppress leads');
  } else {
    // El dominio cierra los emails @dominio y también la empresa con ese sitio web.
    affected = rowsOrThrow(await db().from('kefy_sales_leads')
      .update({ stage: 'lost', lost_reason: 'do_not_contact', next_action: null, next_action_at: null, updated_at: ctx.now.toISOString() })
      .or(`email.ilike.%@${value},domain.eq.${value}`).not('stage', 'in', '(won,lost)').select('id'), 'suppress leads');
  }
  return { suppressed: { kind, value }, leads_closed: affected.map((r) => r.id) };
}

/** CSV de los leads (RFC 4180), con las columnas que sirven para escribirles. */
export async function exportSalesLeads(ctx: AdminContext, input: { stage?: LeadStage[]; offer?: LeadOffer; contactable_only: boolean }) {
  const { leads } = await listSalesLeads(ctx, { stage: input.stage, offer: input.offer, contactable_only: input.contactable_only, limit: 5000, offset: 0 });
  const cols = ['id', 'kind', 'stage', 'offer', 'priority', 'name', 'company', 'email', 'phone', 'website', 'domain', 'instagram',
    'city', 'country', 'industry', 'segment', 'source', 'source_url', 'contacts', 'signals', 'sequence_step', 'next_action',
    'next_action_at', 'last_contacted_at', 'tags', 'contactable'];
  // Contactos y señales legibles en una celda: «Ana (Gerente) <ana@x.cl> [https://…]».
  const flat = (l: Row): Row => ({
    ...l,
    contacts: (l.contacts ?? []).map((c: Row) => [
      c.name, c.role && `(${c.role})`, c.email && `<${c.email}>`, c.phone, c.instagram && `@${c.instagram}`,
      c.blocked_reason && `{${c.blocked_reason}}`, c.source_url && `[${c.source_url}]`,
    ].filter(Boolean).join(' ')),
    signals: (l.signals ?? []).map((sg: Row) => (sg.detail ? `${sg.type}: ${sg.detail}` : sg.type)),
  });
  const cell = (v: unknown) => {
    const s = Array.isArray(v) ? v.join('|') : v === null || v === undefined ? '' : String(v);
    // Evita inyección de fórmulas al abrirlo en una planilla.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = [cols.join(','), ...leads.map((l) => flat(l as Row)).map((l) => cols.map((c) => cell(l[c])).join(','))].join('\n');
  return { rows: leads.length, csv };
}
