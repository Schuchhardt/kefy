// ─── Vista previa pública de una marca demo ──────────────────────────────────
//
// La lee app/[lang]/demo/[token] sin sesión: el token de la URL es la única
// credencial. Se busca por su hash (kefy_demo_previews.token_hash), y solo si
// no venció ni se revocó. Devuelve lo mínimo para mostrar la marca y sus
// posts: nombre, logo, colores y el texto e imagen de cada post. Nada de la
// organización, del lead ni de otros contenidos.
//
// Lo crea el MCP admin (lib/services/admin/demo-brands.ts). Ver docs/admin-mcp.md.

import { createHash } from 'node:crypto';
import { createSupabaseServer } from '@/lib/supabase';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const MAX_POSTS = 12;

export interface DemoPreviewPost {
  id: string;
  channel: string;
  body: string | null;
  hashtags: string[];
  imageUrl: string | null;
}

export interface DemoPreview {
  brand: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
  };
  posts: DemoPreviewPost[];
  expiresAt: string;
}

export function hashPreviewToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function httpsOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}

/** La vista previa del token, o null si no existe, venció o se revocó. Cuenta la visita. */
export async function getDemoPreview(token: string, now: Date = new Date()): Promise<DemoPreview | null> {
  if (!TOKEN_RE.test(token)) return null;
  const db = createSupabaseServer();

  const { data: preview } = await db.from('kefy_demo_previews')
    .select('id, brand_id, expires_at, revoked_at, views')
    .eq('token_hash', hashPreviewToken(token))
    .maybeSingle();
  const p = preview as Row | null;
  if (!p || p.revoked_at || new Date(p.expires_at).getTime() <= now.getTime()) return null;

  const [brand, kit, items] = await Promise.all([
    db.from('kefy_brands').select('id, name, avatar_url, archived').eq('id', p.brand_id).maybeSingle(),
    db.from('kefy_brand_kits').select('name, tagline, logo_url, primary_color, accent_color').eq('brand_id', p.brand_id).maybeSingle(),
    db.from('kefy_content_items').select('id, channel, body, hashtags, image_url')
      .eq('brand_id', p.brand_id).order('created_at', { ascending: true }).limit(MAX_POSTS),
  ]);
  const b = brand.data as Row | null;
  if (!b || b.archived) return null;
  const k = (kit.data as Row | null) ?? {};

  // La visita se cuenta sin bloquear la página si falla.
  await db.from('kefy_demo_previews')
    .update({ views: (Number(p.views) || 0) + 1, last_viewed_at: now.toISOString() })
    .eq('id', p.id);

  return {
    brand: {
      name: (k.name as string) || (b.name as string),
      tagline: (k.tagline as string) || null,
      logoUrl: httpsOrNull(k.logo_url) ?? httpsOrNull(b.avatar_url),
      primaryColor: HEX_COLOR_RE.test(k.primary_color ?? '') ? k.primary_color : null,
      accentColor: HEX_COLOR_RE.test(k.accent_color ?? '') ? k.accent_color : null,
    },
    posts: ((items.data as Row[] | null) ?? [])
      .filter((i) => i.body || i.image_url)
      .map((i) => ({
        id: i.id,
        channel: i.channel ?? 'instagram',
        body: i.body ?? null,
        hashtags: Array.isArray(i.hashtags) ? i.hashtags : [],
        imageUrl: httpsOrNull(i.image_url),
      })),
    expiresAt: p.expires_at,
  };
}
