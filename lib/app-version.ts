/**
 * Versión de la app: la genera `scripts/generate-build-id.mjs` en cada build y
 * queda escrita en `lib/generated/build-id.ts` (archivo ignorado por git).
 *
 * No depende de ninguna variable de entorno. Al ser un módulo normal, se compila
 * una sola vez y toda la app —cliente, servidor y service worker— comparte
 * exactamente el mismo valor.
 *
 * Se usa para:
 *  - nombrar las caches del service worker (`kefy-*-<version>`), de modo que
 *    un despliegue nuevo invalide por completo las caches del anterior;
 *  - que el cliente detecte, comparando contra `/api/version`, que está
 *    corriendo una versión vieja y recargue.
 */
export { APP_VERSION } from './generated/build-id';
