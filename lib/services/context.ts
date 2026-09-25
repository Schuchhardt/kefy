// ─── Contexto de los servicios ────────────────────────────────────────────────
//
// Los servicios de lib/services/* son la lógica de negocio que comparten las
// rutas de la UI y las herramientas del asistente (chat, MCP y API). No tocan
// NextRequest ni cookies: todo lo que necesitan del llamador viaja aquí.
//
// brandScope:
//   'org'    — solo se filtra por org_id. Es lo que hacen hoy las rutas de la UI
//              y se mantiene para no cambiarles el comportamiento.
//   'strict' — además se filtra por brand_id. Lo usan siempre las herramientas:
//              una API key atada a una marca no puede tocar otra.

import type { JWTPayload } from '@/types/auth';

export type BrandScope = 'strict' | 'org';
export type ServiceSource = 'route' | 'chat' | 'api' | 'mcp';

export interface ServiceContext {
  auth: JWTPayload;
  brandId: string;
  language: 'es' | 'en';
  brandScope: BrandScope;
  source: ServiceSource;
}

export function serviceContext(
  auth: JWTPayload,
  brandId: string,
  language: 'es' | 'en' = 'es',
  opts: { brandScope?: BrandScope; source?: ServiceSource } = {},
): ServiceContext {
  return {
    auth,
    brandId,
    language,
    brandScope: opts.brandScope ?? 'org',
    source: opts.source ?? 'route',
  };
}
