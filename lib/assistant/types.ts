// ─── Tipos compartidos del asistente ─────────────────────────────────────────
//
// Los importan tanto el servidor (registro de acciones, chat, MCP, API) como el
// widget del dashboard. Por eso aquí solo hay tipos y los imports son
// `import type`: nada de código de servidor llega al bundle del cliente.

import type { OrgRole } from '@/lib/team';
import type { ServiceContext } from '@/lib/services/context';

export type ToolKind = 'read' | 'write' | 'publish';
/** Los scopes de una API key coinciden con los tipos de herramienta. */
export type Scope = ToolKind;
export type Source = 'chat' | 'mcp' | 'api';

/** Qué datos cambió una acción, para que las páginas abiertas se recarguen. */
export type Entity = 'content' | 'scheduled' | 'brand-kit' | 'strategy' | 'inbox' | 'analytics' | 'autopilot';

export interface ToolLink {
  label: string;
  href: string;
}

export interface ToolErrorBody {
  code: string;
  status: number;
  message: string;
  /** Cuerpo exacto de la guardia (subscriptionRequired, creditsExhausted, retryAfter…). */
  body?: Record<string, unknown>;
  /** Cabeceras HTTP a reenviar (Retry-After en un 429). */
  headers?: Record<string, string>;
}

export type ToolSuccess = {
  ok: true;
  data: unknown;
  links?: ToolLink[];
  dataChanged?: Entity[];
  uiAction?: { type: 'navigate'; href: string };
  tainted?: boolean;
};

export type ToolPending = {
  ok: 'pending';
  actionId: string;
  summary: string;
  preview: Record<string, unknown>;
  credits: number;
};

export type ToolFailure = { ok: false; error: ToolErrorBody };

export type ToolResult = ToolSuccess | ToolFailure | ToolPending;

export type DoneReason = 'end_turn' | 'awaiting_confirmation' | 'step_limit' | 'refusal' | 'aborted';

export type SseEvent =
  | { type: 'message_start'; conversationId: string; turnId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; toolUseId: string; name: string }
  | { type: 'tool_end'; toolUseId: string; name: string; ok: boolean; links?: ToolLink[]; error?: ToolErrorBody }
  | {
      type: 'confirmation_required';
      actionId: string;
      toolUseId: string;
      name: string;
      summary: string;
      preview: Record<string, unknown>;
      credits: number;
      expiresAt: string;
    }
  | { type: 'ui_action'; action: { type: 'navigate'; href: string } }
  | { type: 'data_changed'; entities: Entity[] }
  | { type: 'error'; code: string; status?: number; message: string; body?: Record<string, unknown> }
  | {
      type: 'done';
      /** Mensajes del asistente usados / tope / restantes este mes. */
      usage?: { used: number; limit: number; remaining: number };
      reason?: DoneReason;
    };

// ─── Solo servidor ────────────────────────────────────────────────────────────

/**
 * Contexto con el que se ejecuta una herramienta. Siempre `brandScope:
 * 'strict'`: una herramienta solo toca datos de la marca del contexto.
 */
export interface ToolContext extends ServiceContext {
  orgId: string;
  userId: string;
  role: OrgRole;
  plan: string;
  source: Source;
  scopes: Scope[];
  apiKeyId?: string;
  /** Marca a la que está atada la API key, si lo está. */
  boundBrandId?: string | null;
  conversationId?: string;
  turnId?: string;
  /** Mensaje del asistente que contiene los tool_use en curso (solo chat). */
  messageId?: string;
  /** Acción confirmada que se está ejecutando; base del request_id de Zernio. */
  actionId?: string;
  timezone?: string;
  turn?: { tainted: boolean; pausedInMessage: boolean };
}
