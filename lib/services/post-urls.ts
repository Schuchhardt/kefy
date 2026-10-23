// ─── URL pública de las publicaciones ────────────────────────────────────────
//
// Antes de tocar este archivo, leer docs/zernio.md (AGENTS.md).
//
// `kefy_scheduled_posts.platform_post_url` se llena al publicar en el momento
// y con los webhooks de Zernio. Una fila publicada que todavía no la tiene
// (un post programado cuyo webhook no llegó, TikTok antes de resolver su URL,
// filas anteriores a la columna) se completa aquí al leerla, con
// GET /v1/posts/{id}, y se guarda para no volver a preguntar.

import { createSupabaseServer } from '@/lib/supabase';
import { getPublishedPostUrl } from '@/lib/zernio';

/** Como mucho estas consultas a Zernio por lectura: el resto espera a la siguiente. */
const MAX_LOOKUPS = 10;

export interface PostUrlRow {
  id: string;
  status?: string | null;
  zernio_post_id?: string | null;
  platform_post_url?: string | null;
}

/**
 * Completa en sitio `platform_post_url` de las filas publicadas que no la
 * tienen. Best-effort: un fallo de Zernio deja la fila sin URL (el botón no se
 * muestra) y nunca rompe el listado.
 */
export async function fillMissingPostUrls<T extends PostUrlRow>(rows: T[]): Promise<T[]> {
  const missing = rows
    .filter((r) => (r.status ?? 'published') === 'published' && !r.platform_post_url && r.zernio_post_id)
    .slice(0, MAX_LOOKUPS);
  if (missing.length === 0) return rows;

  const db = createSupabaseServer();
  await Promise.all(missing.map(async (row) => {
    try {
      const { url, platform_post_id } = await getPublishedPostUrl(row.zernio_post_id!);
      if (!url) return;
      row.platform_post_url = url;
      const update: Record<string, string> = { platform_post_url: url };
      if (platform_post_id) update.platform_post_id = platform_post_id;
      await db.from('kefy_scheduled_posts').update(update).eq('id', row.id);
    } catch (err) {
      console.warn(`[post-urls] no se pudo obtener la URL de ${row.zernio_post_id}:`, err instanceof Error ? err.message : err);
    }
  }));
  return rows;
}
