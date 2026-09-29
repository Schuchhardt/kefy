// ─── Volver a donde iba después del login ────────────────────────────────────
//
// Si alguien abre un link del dashboard sin sesión (p. ej. el link para
// conectar una red que da el asistente), proxy.ts lo manda al login con
// `?next=<ruta>` y el login (o el registro) lo devuelve ahí. Solo se aceptan
// rutas propias del mismo idioma: cualquier otra cosa (otro dominio, `//host`,
// `/\host`, esquemas) sería una redirección abierta.
//
// Además del dashboard se aceptan el onboarding y la página de invitación: la
// invitación manda a iniciar sesión con `?next=/es/invitacion?token=…` para
// volver a aceptarla después.

/** Secciones a las que se puede volver, bajo `/{lang}/`. */
const ALLOWED_ROOTS = ['dashboard', 'onboarding', 'invitacion', 'invitation'] as const;

/** `next` si es una ruta segura de `lang`; si no, null. */
export function safeNextPath(next: string | null | undefined, lang: string): string | null {
  if (!next || next.length > 2000) return null;
  // Rechaza caracteres de control y barras invertidas antes de parsear.
  if (/[\u0000-\u001f\\]/.test(next)) return null;
  if (!next.startsWith(`/${lang}/`)) return null;

  const base = 'http://kefy.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  // Se valida la ruta ya normalizada: `/es/dashboard/../../login` resuelve a
  // `/login` y deja de coincidir.
  const path = url.pathname;
  const allowed = ALLOWED_ROOTS.some((root) => {
    const prefix = `/${lang}/${root}`;
    return path === prefix || path.startsWith(`${prefix}/`);
  });
  if (!allowed) return null;
  return `${path}${url.search}`;
}
