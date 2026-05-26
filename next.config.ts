import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'image.mux.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Prevent Next.js from bundling heavy server-only packages into the edge runtime.
  // @remotion/renderer and @remotion/bundler require native Node.js modules (Chromium, ffmpeg).
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    '@mux/mux-node',
    'better-sqlite3',
  ],
};

export default nextConfig;
