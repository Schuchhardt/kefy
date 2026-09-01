import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Identificador único del build. Se usa como `generateBuildId` de Next y se
 * expone al cliente como `NEXT_PUBLIC_APP_VERSION` para versionar las caches
 * del service worker (ver `lib/service-worker.ts`).
 *
 * Orden de preferencia: variable explícita → SHA del commit del proveedor de
 * hosting (Vercel / Netlify) → git local → timestamp.
 */
function resolveBuildId(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_REF;

  if (fromEnv) return fromEnv.slice(0, 12);

  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

const buildId = resolveBuildId();

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
