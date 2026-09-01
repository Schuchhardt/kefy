import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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

// El wrapper de Sentry sube los source maps del build para que los stack traces
// de producción apunten al código original y no al bundle minificado.
//
// Sin SENTRY_AUTH_TOKEN no hay subida: el build sigue funcionando igual, solo
// que los traces quedan minificados. Así el proyecto compila en cualquier
// entorno sin credenciales (CI de un fork, clon local, preview).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // El log de la subida solo estorba en el output del build.
  silent: !process.env.CI,

  // Los source maps se borran del bundle cliente tras subirlos: los stack
  // traces se resuelven en Sentry, no hace falta exponer el código original.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Proxy propio para los eventos del navegador: evita que los bloqueadores de
  // anuncios se coman los reportes de error del cliente.
  tunnelRoute: "/monitoring",

  webpack: {
    // Quita los logs internos del SDK del bundle de producción.
    treeshake: { removeDebugLogging: true },

    // Instrumenta los cron de Vercel para que una ejecución fallida o perdida
    // aparezca en Sentry (autopilot, biblioteca de contenido, reconciliación).
    automaticVercelMonitors: true,
  },
});
