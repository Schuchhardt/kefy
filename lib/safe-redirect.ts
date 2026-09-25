// ─── Volver a donde iba después del login ────────────────────────────────────
//
// Si alguien abre un link del dashboard sin sesión (p. ej. el link para
// conectar una red que da el asistente), proxy.ts lo manda al login con
// `?next=<ruta>` y el login lo devuelve ahí. Solo se aceptan rutas del
// dashboard del mismo idioma: cualquier otra cosa (otro dominio, `//host`,
// `/\host`, esquemas) sería una redirección abierta.

/** `next` si es una ruta segura del dashboard de `lang`; si no, null. */
export function safeNextPath(next: string | null | undefined, lang: string): string | null {
  if (!next || next.length > 2000) return null;
  // Rechaza caracteres de control y barras invertidas antes de parsear.
  if (/[\u0000-\u001f\\]/.test(next)) return null;
  if (!next.startsWith(`/${lang}/dashboard`)) return null;

  const base = 'http://kefy.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  const path = url.pathname;
  if (path !== `/${lang}/dashboard` && !path.startsWith(`/${lang}/dashboard/`)) return null;
  return `${path}${url.search}`;
}
