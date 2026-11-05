// ─── MCP Apps: qué vista abre cada herramienta ───────────────────────────────
//
// Ayudantes para el campo `app` de defineTool (lib/assistant/registry.ts):
//
//   contentReviewApp → ui://kefy/content-review.html (Vista 1)
//   videoPlanApp     → ui://kefy/video-plan.html     (Vista 2)
//
// Cada uno recibe una función que, a partir de la entrada y del `data` del
// resultado, dice qué pieza mostrar; el servicio de vista hace el resto. Las
// herramientas que la vista llama pero que no abren vista declaran solo
// `app: { visibility: ['model', 'app'] }`. Ver docs/mcp-apps.md.

import type { ToolApp } from '@/lib/assistant/registry';
import type { ToolContext } from '@/lib/assistant/types';
import { CONTENT_REVIEW_URI, VIDEO_PLAN_URI } from '@/lib/mcp-app/server';
import { ContentViewSchema, VideoViewSchema } from '@/lib/mcp-app/contract';
import { buildContentView, type ContentViewInput, type ViewPermissions } from '@/lib/services/content-view';
import { buildVideoView, type VideoViewInput } from '@/lib/services/video-view';

/** Los botones de la vista dependen de los scopes de la conexión MCP. */
export function viewPermissions(ctx: Pick<ToolContext, 'scopes'>): ViewPermissions {
  return { write: ctx.scopes.includes('write'), publish: ctx.scopes.includes('publish') };
}

export function contentReviewApp<I>(
  pick: (input: I, data: unknown) => Omit<ContentViewInput, 'permissions'> | null,
): ToolApp<I> {
  return {
    resourceUri: CONTENT_REVIEW_URI,
    visibility: ['model', 'app'],
    viewSchema: ContentViewSchema,
    view: async (ctx, input, data) => {
      const sel = pick(input, data);
      if (!sel || sel.itemIds.length === 0) return null;
      return buildContentView(ctx, { ...sel, permissions: viewPermissions(ctx) });
    },
  };
}

export function videoPlanApp<I>(
  pick: (input: I, data: unknown) => Omit<VideoViewInput, 'permissions'> | null,
): ToolApp<I> {
  return {
    resourceUri: VIDEO_PLAN_URI,
    visibility: ['model', 'app'],
    viewSchema: VideoViewSchema,
    view: async (ctx, input, data) => {
      const sel = pick(input, data);
      if (!sel) return null;
      return buildVideoView(ctx, { ...sel, permissions: viewPermissions(ctx) });
    },
  };
}

/** `data.item_id` (y `data.image_error`) de create_post / create_story / create_carousel. */
export function createdItem(data: unknown): Omit<ContentViewInput, 'permissions'> | null {
  const d = (data ?? {}) as { item_id?: unknown; image_error?: { code: string; message: string } };
  if (typeof d.item_id !== 'string') return null;
  return {
    itemIds: [d.item_id],
    imageErrors: d.image_error ? { [d.item_id]: d.image_error } : undefined,
  };
}
