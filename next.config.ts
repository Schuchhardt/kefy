import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'image.mux.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // Archivos que se leen del filesystem en runtime. El trazado automático de
  // Next sólo sigue los `import`, así que sin esto no viajan con la función
  // serverless: las fuentes son las que evitan que el texto quemado salga como
  // cuadraditos, y los prompts los que definen el tono de la generación.
  outputFileTracingIncludes: {
    '/api/**': ['./assets/fonts/**', './prompts/**'],
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
