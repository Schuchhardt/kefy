/**
 * Cálculo de la versión del build (`NEXT_PUBLIC_APP_VERSION`).
 *
 * Se usa en `next.config.ts` — es código de build time, nunca se importa desde
 * la app. Ver `docs/pwa.md`.
 */

/** Deja el identificador apto para nombres de cache y URLs. */
export function sanitizeBuildId(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'build'
  );
}

export type BuildEnv = Record<string, string | undefined>;

/**
 * Genera la versión del build automáticamente: `<commit>-<despliegue>`.
 *
 * - El commit (Vercel / Netlify / GitHub Actions / git local) sirve para saber
 *   qué código está desplegado.
 * - El identificador de despliegue hace que **cada build sea único**, aunque se
 *   vuelva a desplegar exactamente el mismo commit (rollback, redeploy, cambio
 *   de variables de entorno). Sin esto, un redeploy reusaría la versión previa
 *   y el service worker no invalidaría su cache.
 *
 * `NEXT_PUBLIC_APP_VERSION` tiene prioridad sobre todo: es la vía por la que
 * `next.config.ts` propaga el valor ya calculado a los procesos worker que Next
 * lanza durante el build (heredan el env del proceso padre), de modo que todos
 * los chunks se compilan con exactamente la misma versión.
 */
export function resolveBuildId(
  env: BuildEnv,
  gitSha: () => string | null,
  now: () => number = Date.now
): string {
  if (env.NEXT_PUBLIC_APP_VERSION) return sanitizeBuildId(env.NEXT_PUBLIC_APP_VERSION);

  const commit =
    env.VERCEL_GIT_COMMIT_SHA ?? // Vercel
    env.COMMIT_REF ?? // Netlify
    env.GITHUB_SHA ?? // GitHub Actions
    gitSha() ??
    'local';

  const deployment =
    env.VERCEL_DEPLOYMENT_ID ?? // Vercel: único por despliegue
    env.DEPLOY_ID ?? // Netlify: único por despliegue
    env.GITHUB_RUN_ID ?? // GitHub Actions
    now().toString(36);

  return sanitizeBuildId(`${commit.slice(0, 8)}-${deployment.slice(-10)}`);
}
