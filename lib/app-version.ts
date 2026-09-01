/**
 * Versión de la aplicación, inyectada en tiempo de build por `next.config.ts`
 * (ver `resolveBuildId`). Cada despliegue produce un valor distinto.
 *
 * Se usa para:
 *  - nombrar las caches del service worker (`kefy-*-<version>`), de modo que
 *    un despliegue nuevo invalide por completo las caches del anterior;
 *  - que el cliente detecte, comparando contra `/api/version`, que está
 *    corriendo una versión vieja y recargue.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
