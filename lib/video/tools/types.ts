// ─── Contrato de las herramientas de video ────────────────────────────────────
//
// Cada paso del plan de un video es la llamada a una herramienta. Todas
// comparten este contrato, igual que los verbos de openfilm (`get image`,
// `get video`, `get tts`…) comparten uno sobre proveedores intercambiables:
//
//   run(ctx, input)  → done (con su salida) | pending (con un handle) | failed
//   poll(ctx, handle) → lo mismo, para las herramientas asíncronas
//
// Las síncronas (imagen, voz) terminan dentro del request. Las asíncronas
// (animación, lipsync, montaje) se encolan en la nube y el motor las consulta
// en cada vuelta (`lib/video/engine.ts`).

import type { CreditOperation } from '@/lib/usage';

export const VIDEO_TOOL_NAMES = [
  'generate_image', 'text_to_speech', 'animate_image', 'lip_sync', 'compose_video',
] as const;
export type VideoToolName = (typeof VIDEO_TOOL_NAMES)[number];

/**
 * Qué operación de créditos cobra cada herramienta. Vive aquí (sin SDKs) para
 * que el plan pueda cotizar sin cargar los clientes de los proveedores.
 */
export const TOOL_CREDIT_OPERATION: Record<VideoToolName, CreditOperation> = {
  generate_image: 'image',
  text_to_speech: 'voice',
  animate_image:  'animation',
  lip_sync:       'lipsync',
  compose_video:  'video',
};

export interface ToolRunContext {
  orgId:       string;
  jobId:       string;
  stepKey:     string;
  /** Número de intento del paso (1, 2…): con el id del paso arma la clave de idempotencia. */
  attempt?:    number;
  /** URL a la que el proveedor avisa al terminar (solo herramientas asíncronas). */
  webhookUrl?: string;
}

export type ToolResult =
  | { status: 'done';    output: Record<string, unknown> }
  | { status: 'pending'; handle: Record<string, unknown> }
  | { status: 'failed';  error: string };

export interface VideoTool {
  name:     VideoToolName;
  label:    { es: string; en: string };
  /** Qué hace, en una línea, para el panel del plan y la documentación del asistente. */
  summary:  { es: string; en: string };
  provider: 'openai' | 'fal' | 'higgsfield' | 'remotion';
  /** Operación de créditos que cuesta cada llamada. */
  credit:   CreditOperation;
  mode:     'sync' | 'async';
  /** false si falta la configuración del proveedor: el plan no la usa. */
  available(): boolean;
  run(ctx: ToolRunContext, input: Record<string, unknown>): Promise<ToolResult>;
  poll?(ctx: ToolRunContext, handle: Record<string, unknown>): Promise<ToolResult>;
}
