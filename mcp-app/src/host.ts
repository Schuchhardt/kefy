// Envoltorio tipado sobre el App del SDK de MCP Apps.
//
// La vista NUNCA llama a la API de Kefy: toda acción pasa por el host
// (callServerTool) hacia el servidor MCP, con la misma sesión autenticada y el
// mismo scoping por marca que las herramientas de texto. Cada llamada lleva
// brand_id explícito (una organización con varias marcas respondería
// brand_required).
//
// `Host` es una interfaz para que los componentes se prueben con un host falso.

import type { App } from '@modelcontextprotocol/ext-apps';

export type ToolOutcome =
  | { ok: true; data: unknown; view: unknown }
  | { ok: false; code: string; message: string; timeout: boolean };

export interface Host {
  callTool(name: string, args: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<ToolOutcome>;
  /** Mensaje del usuario al chat (el modelo responde). false si el host no lo admite. */
  sendMessage(text: string): Promise<boolean>;
  /** Contexto para los próximos turnos del modelo, sin disparar uno. */
  updateModelContext(text: string): Promise<void>;
  openLink(url: string): Promise<void>;
  requestDisplayMode(mode: 'inline' | 'fullscreen'): Promise<string | null>;
}

/** Acciones que generan con IA: imagen, conversión, guion. El host corta a los 60 s por defecto. */
export const LONG_CALL_MS = 240_000;

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

function isTimeout(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === -32001 || /timed? ?out/i.test(String(e?.message ?? ''));
}

export function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function createHost(app: App): Host {
  return {
    async callTool(name, args, opts) {
      try {
        const r = await app.callServerTool(
          { name, arguments: args },
          opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
        );
        const sc = (r.structuredContent ?? {}) as { data?: unknown; view?: unknown; error?: { code?: string; message?: string } };
        if (r.isError) {
          const text = textOf(r as never);
          return {
            ok: false,
            code: sc.error?.code ?? 'error',
            message: sc.error?.message ?? (text || 'Error'),
            timeout: false,
          };
        }
        return { ok: true, data: sc.data ?? null, view: sc.view ?? null };
      } catch (err) {
        return {
          ok: false,
          code: isTimeout(err) ? 'timeout' : 'host_error',
          message: err instanceof Error ? err.message : String(err),
          timeout: isTimeout(err),
        };
      }
    },
    async sendMessage(text) {
      if (!app.getHostCapabilities()?.message) return false;
      try {
        const r = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
        return !(r as { isError?: boolean } | undefined)?.isError;
      } catch {
        return false;
      }
    },
    async updateModelContext(text) {
      if (!app.getHostCapabilities()?.updateModelContext) return;
      try {
        await app.updateModelContext({ content: [{ type: 'text', text }] });
      } catch {
        // Es solo contexto: si el host no lo acepta, la vista sigue igual.
      }
    },
    async openLink(url) {
      // Solo http(s): una URL de publicación viene de la red social, no de Kefy.
      if (!isWebUrl(url)) return;
      try {
        await app.openLink({ url });
      } catch {
        // Sin openLinks el host no abre nada; el enlace sigue visible.
      }
    },
    async requestDisplayMode(mode) {
      try {
        const r = await app.requestDisplayMode({ mode });
        return r.mode;
      } catch {
        return null;
      }
    },
  };
}
