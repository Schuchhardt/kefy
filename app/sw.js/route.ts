import { APP_VERSION } from '@/lib/app-version';
import { buildServiceWorkerSource } from '@/lib/service-worker';

// El contenido cambia en cada despliegue (lleva la versión incrustada), que es
// precisamente lo que hace que el navegador detecte un service worker nuevo.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(buildServiceWorkerSource(APP_VERSION), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // El navegador debe revalidar siempre el script del worker.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
