import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { getAuthFromRequest } from '@/lib/auth';
import { canManageTeam } from '@/lib/team';
import { getActiveBrandById } from '@/lib/brands';
import { requireActiveSubscription } from '@/lib/subscription';
import { reportError } from '@/lib/observability';
import {
  API_KEY_SCOPES, MAX_ACTIVE_API_KEYS, generateApiKey,
} from '@/lib/assistant/api-keys';
import type { Scope } from '@/lib/assistant/types';

// ─── /api/api-keys ───────────────────────────────────────────────────────────
// Gestión de las API keys de la organización (MCP y /api/v1). Solo el dueño y
// los administradores. Se autentica con la cookie de sesión: una API key no
// puede crear otras keys.
//
// El hash nunca sale de aquí y el secreto en claro solo aparece una vez, en la
// respuesta del POST. Ver docs/assistant.md.

// Nunca key_hash.
const LIST_COLUMNS =
  'id, name, key_prefix, scopes, brand_id, created_by, last_used_at, expires_at, revoked_at, created_at, kefy_users(name, email)';

type KeyStatus = 'active' | 'revoked' | 'expired';

function statusOf(row: { revoked_at: string | null; expires_at: string | null }, now: number): KeyStatus {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return 'expired';
  return 'active';
}

// ─── GET /api/api-keys ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSupabaseServer();
  const { data, error } = await db
    .from('kefy_api_keys')
    .select(LIST_COLUMNS)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    reportError(new Error(error.message), { route: 'GET /api/api-keys', auth, service: 'supabase' });
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  }

  const now = Date.now();
  const keys = (data ?? []).map((k) => {
    const user = k.kefy_users as unknown as { name: string | null; email: string } | null;
    return {
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      scopes: k.scopes,
      brand_id: k.brand_id,
      created_by: k.created_by,
      created_by_user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
      last_used_at: k.last_used_at,
      expires_at: k.expires_at,
      revoked_at: k.revoked_at,
      created_at: k.created_at,
      status: statusOf(k, now),
    };
  });

  return NextResponse.json({ keys }, { headers: { 'Cache-Control': 'no-store' } });
}

// ─── POST /api/api-keys ──────────────────────────────────────────────────────
// Body: { name, scopes: ('read'|'write'|'publish')[], brand_id?, expires_in_days?, lang? }

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z
    .array(z.enum(API_KEY_SCOPES as [Scope, ...Scope[]]))
    .min(1)
    .transform((s) => [...new Set(s)]),
  brand_id: z.uuid().optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  lang: z.enum(['es', 'en']).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageTeam(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: z.flattenError(parsed.error) },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const lang = input.lang ?? 'es';

  if (input.brand_id) {
    const brand = await getActiveBrandById(input.brand_id, auth.orgId);
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // Una key sirve para crear y publicar: sin suscripción activa no se emite.
  const blocked = await requireActiveSubscription(auth.orgId, lang);
  if (blocked) return blocked;

  const db = createSupabaseServer();
  const nowIso = new Date().toISOString();

  const { count, error: countError } = await db
    .from('kefy_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (countError) {
    reportError(new Error(countError.message), { route: 'POST /api/api-keys', auth, service: 'supabase' });
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_ACTIVE_API_KEYS) {
    return NextResponse.json(
      { error: `Key limit reached (${MAX_ACTIVE_API_KEYS})` },
      { status: 409 },
    );
  }

  const { raw: secret, hash, prefix } = generateApiKey();
  const expiresAt = input.expires_in_days
    ? new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: created, error: insertError } = await db
    .from('kefy_api_keys')
    .insert({
      org_id: auth.orgId,
      brand_id: input.brand_id ?? null,
      created_by: auth.userId,
      name: input.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: input.scopes,
      expires_at: expiresAt,
    })
    .select('id, name, key_prefix, scopes, brand_id, expires_at, created_at')
    .single();

  if (insertError || !created) {
    reportError(new Error(insertError?.message ?? 'Insert returned no row'), {
      route: 'POST /api/api-keys', auth, service: 'supabase',
    });
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }

  return NextResponse.json(
    {
      key: {
        id: created.id,
        name: created.name,
        prefix: created.key_prefix,
        scopes: created.scopes,
        brand_id: created.brand_id,
        expires_at: created.expires_at,
        created_at: created.created_at,
      },
      // Única vez que sale el secreto: después solo se ve el prefijo.
      secret,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
