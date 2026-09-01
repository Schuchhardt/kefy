// ─── URL pública de la aplicación ────────────────────────────────────────────
//
// Varias rutas construyen enlaces que salen del servidor y tienen que funcionar
// en el navegador de otra persona: el correo de recuperación de contraseña, las
// URLs de retorno de Stripe y el callback de OAuth.
//
// Antes cada una resolvía la base con `process.env.NEXT_PUBLIC_APP_URL ??
// 'http://localhost:3097'`. Como esa variable no estaba configurada en Vercel,
// en producción los correos de recuperación llevaban a localhost y quien pagaba
// en Stripe volvía a una dirección que no existe.
//
// Este módulo centraliza la resolución para que ese fallo no pueda repetirse al
// añadir la siguiente ruta que necesite una URL absoluta.

/** Puerto del servidor de desarrollo (ver el script `dev` de package.json). */
const DEV_PORT = 3099;

/**
 * Base absoluta de la app, sin barra final.
 *
 * Orden de resolución:
 *   1. `NEXT_PUBLIC_APP_URL` — el dominio canónico. Configurado en producción.
 *   2. `VERCEL_URL` — la URL del despliegue concreto. Cubre los previews, donde
 *      lo correcto es apuntar al propio preview y no a producción.
 *   3. `localhost` — desarrollo local.
 *
 * El paso 2 es lo que garantiza que nada desplegado en Vercel pueda devolver
 * una URL de localhost, aunque falte la variable.
 */
export function appUrl(): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configurada) return sinBarraFinal(configurada);

  // Vercel expone VERCEL_URL sin protocolo: 'kefy-abc123-depando.vercel.app'.
  const despliegue = process.env.VERCEL_URL?.trim();
  if (despliegue) return sinBarraFinal(conProtocolo(despliegue));

  return `http://localhost:${DEV_PORT}`;
}

/** Une la base con una ruta, sin barras duplicadas ni ausentes. */
export function absoluteUrl(path: string): string {
  const base = appUrl();
  if (!path) return base;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function conProtocolo(host: string): string {
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, '');
}
