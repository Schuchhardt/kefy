import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { resolveBuildId } from "./lib/build-id";

function gitSha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Versión del build. Se genera sola en cada build (commit + identificador de
 * despliegue), así que no hay nada que actualizar a mano al desplegar y dos
 * builds del mismo commit tienen versiones distintas.
 *
 * Se usa como `generateBuildId` de Next y se expone al cliente como
 * `NEXT_PUBLIC_APP_VERSION` para versionar las caches del service worker
 * (ver `lib/service-worker.ts` y `docs/pwa.md`).
 */
const buildId = resolveBuildId(process.env, gitSha);

// Next lanza procesos worker durante el build que vuelven a cargar este
// archivo; heredan el env del padre, así que todos resuelven la misma versión.
process.env.NEXT_PUBLIC_APP_VERSION = buildId;

const nextConfig: NextConfig = {
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_APP_VERSION: buildId,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'image.mux.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Prevent Next.js from bundling heavy server-only packages into the edge runtime.
  // @remotion/lambda/client uses AWS SDK which must stay external.
  serverExternalPackages: [
    '@remotion/lambda',
    '@remotion/renderer',
    '@remotion/bundler',
    '@aws-sdk/client-lambda',
    '@aws-sdk/client-s3',
    '@mux/mux-node',
    'better-sqlite3',
  ],
};

export default nextConfig;
