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
  // serverless: los prompts definen el tono de la generación, y las fuentes
  // son las que evitan que el texto quemado salga como cuadraditos.
  //
  // Las fuentes (~9 MB) van sólo en las dos rutas que componen texto sobre la
  // imagen; incluirlas en `/api/**` las metería en cada una de las ~40
  // funciones y dispararía el tamaño del despliegue sin motivo.
  outputFileTracingIncludes: {
    '/api/**':              ['./prompts/**'],
    // El patrón es un glob sobre la ruta: `/api/social/schedule` a secas
    // también arrastraba `/api/social/schedule/[postId]`, que sólo cancela
    // una publicación programada y no compone ninguna imagen.
    '/api/social/publish/route':  ['./assets/fonts/**'],
    '/api/social/schedule/route': ['./assets/fonts/**'],
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
