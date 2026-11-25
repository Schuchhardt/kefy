import { buildLlmsTxt } from '@/lib/llms';

// /llms.txt: resumen del sitio para asistentes de IA (lib/llms.ts). Estático:
// se arma en el build con la copy de ese despliegue.
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
