-- Migration: URL pública de cada publicación en su red
--
-- El botón «Ver publicado» del calendario, de la ficha del contenido y del
-- modal de publicar abre el post en la red donde salió. Zernio da esa URL en
-- tres sitios (ver docs/zernio.md, «URL pública del post»):
--
--   * la respuesta de POST /v1/posts con publishNow (platforms[].platformPostUrl),
--   * los webhooks post.published / post.platform.published /
--     post.tiktok.url_resolved (publishedUrl),
--   * GET /v1/posts/{id}, que Kefy consulta al leer si la fila publicada aún
--     no la tiene (p. ej. un post programado cuyo webhook no llegó).

ALTER TABLE kefy_scheduled_posts ADD COLUMN IF NOT EXISTS platform_post_url TEXT;
