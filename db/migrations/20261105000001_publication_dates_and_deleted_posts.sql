-- ─────────────────────────────────────────────────────────────────────────────
-- Fecha de publicación en «Mis contenidos» y borrado de publicaciones.
-- Ver docs/zernio.md («Estado del contenido» y «Borrar una publicación ya
-- publicada»).
-- Created: 2026-11-05
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Estado 'deleted' ────────────────────────────────────────────────────────
-- La publicación se borró de la red desde Kefy (delete_published_post). Es
-- distinto de 'cancelled', que es una programada que nunca salió.
ALTER TABLE kefy_scheduled_posts DROP CONSTRAINT IF EXISTS kefy_scheduled_posts_status_check;
ALTER TABLE kefy_scheduled_posts ADD CONSTRAINT kefy_scheduled_posts_status_check
  CHECK (status IN ('pending', 'scheduled', 'published', 'failed', 'cancelled', 'deleted'));

-- ─── Contenidos que se quedaron en 'scheduled' ───────────────────────────────
-- El webhook actualizaba kefy_scheduled_posts pero no el contenido: lo que salía
-- seguía «Programado» para siempre. Misma regla que syncContentItemStatus.
UPDATE kefy_content_items ci
SET status = CASE WHEN s.has_published THEN 'published' ELSE 'approved' END
FROM (
  SELECT content_item_id,
         bool_or(status IN ('scheduled', 'pending')) AS has_open,
         bool_or(status = 'published') AS has_published
  FROM kefy_scheduled_posts
  GROUP BY content_item_id
) s
WHERE s.content_item_id = ci.id
  AND ci.status = 'scheduled'
  AND NOT s.has_open;

-- ─── Orden por fecha de publicación ──────────────────────────────────────────
-- Columna calculada de PostgREST: GET /api/content?sort=publication ordena por
-- ella. La próxima salida de lo programado, la última de lo publicado, y la
-- creación del resto. Es la fecha que muestra la tarjeta (lib/content-dates.ts).
CREATE OR REPLACE FUNCTION public.kefy_publication_at(item public.kefy_content_items)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    CASE item.status
      WHEN 'scheduled' THEN (
        SELECT min(sp.scheduled_at) FROM public.kefy_scheduled_posts sp
        WHERE sp.content_item_id = item.id AND sp.status = 'scheduled' AND sp.scheduled_at > now()
      )
      WHEN 'published' THEN (
        SELECT max(sp.published_at) FROM public.kefy_scheduled_posts sp
        WHERE sp.content_item_id = item.id AND sp.status = 'published'
      )
    END,
    item.created_at
  );
$$;

REVOKE ALL ON FUNCTION public.kefy_publication_at(public.kefy_content_items) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kefy_publication_at(public.kefy_content_items) TO service_role;

NOTIFY pgrst, 'reload schema';
