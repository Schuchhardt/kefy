// ─── Estado de un contenido según sus publicaciones ──────────────────────────
//
// `kefy_content_items.status` resume sus filas de `kefy_scheduled_posts`: sin
// esto, lo que salía por el webhook de Zernio seguía «Programado» para siempre.
// Lo usan el webhook, cancelar y borrar una publicación.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';

type Db = ReturnType<typeof createSupabaseServer>;

/**
 * Recalcula el estado de un contenido programado o publicado y devuelve el que
 * queda. Lo ya salido manda sobre lo que falta por salir, igual que en
 * publishContent: programar en otra red no deja editar lo que ya está publicado.
 * Sin nada de eso, vuelve a 'approved' para poder programarlo otra vez. Un
 * borrador, uno archivado o uno sin publicaciones no se tocan.
 */
export async function syncContentItemStatus(db: Db, contentItemId: string): Promise<string | null> {
  const { data: item } = await db
    .from('kefy_content_items')
    .select('status')
    .eq('id', contentItemId)
    .maybeSingle();
  const current = (item as { status?: string } | null)?.status ?? null;
  if (current !== 'scheduled' && current !== 'published') return current;

  const { data: posts, error } = await db
    .from('kefy_scheduled_posts')
    .select('status')
    .eq('content_item_id', contentItemId);
  if (error) {
    reportError(new Error(error.message), {
      route: 'lib/services/content-status', service: 'supabase', extra: { contentItemId },
    });
    return current;
  }

  const statuses = ((posts ?? []) as Array<{ status: string }>).map((p) => p.status);
  if (statuses.length === 0) return current;
  const next = statuses.includes('published') ? 'published'
    : statuses.some((s) => s === 'scheduled' || s === 'pending') ? 'scheduled'
      : 'approved';
  if (next === current) return current;

  const { error: updateError } = await db
    .from('kefy_content_items')
    .update({ status: next })
    .eq('id', contentItemId)
    .in('status', ['scheduled', 'published']);
  if (updateError) {
    reportError(new Error(updateError.message), {
      route: 'lib/services/content-status', service: 'supabase', extra: { contentItemId, next },
    });
    return current;
  }
  return next;
}
