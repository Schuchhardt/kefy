// ─── Resumen de una acción para la tarjeta de confirmación ───────────────────
//
// El texto de «¿Confirmas…?» vive en los locales (toolSummaries de
// locales/{es,en}/dashboard/assistant.ts), que tienen una entrada por cada
// herramienta de ASSISTANT_TOOL_NAMES. Para una herramienta sin resumen, o si
// el resumen falla, se usa el título de la herramienta y, en última
// instancia, su nombre.
//
// Este módulo no importa código de servidor: lo usan el registro (servidor) y
// la tarjeta de confirmación del widget (cliente).

import esAssistant from '@/locales/es/dashboard/assistant';
import enAssistant from '@/locales/en/dashboard/assistant';

export type ToolSummaryFn = (input: any, preview: any) => string; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Todas las herramientas registradas (lib/assistant/tools/*). Los locales
 * deben tener etiqueta y resumen para cada una; el `satisfies` de los locales
 * lo hace cumplir en tiempo de compilación.
 */
export const ASSISTANT_TOOL_NAMES = [
  'get_workspace_context',
  'open_page',
  'get_brand_profile',
  'update_brand_profile',
  'get_strategy_catalog',
  'preview_strategy',
  'set_active_strategy',
  'save_custom_strategy',
  'get_content_ideas',
  'list_content',
  'get_content',
  'create_post',
  'create_carousel',
  'create_manual_content',
  'update_content',
  'generate_content_image',
  'list_social_accounts',
  'publish_content',
  'list_scheduled_posts',
  'cancel_scheduled_post',
  'get_analytics_overview',
  'list_post_performance',
  'sync_social_data',
  'list_conversations',
  'get_conversation_messages',
  'list_comments',
  'reply_to_conversation',
  'reply_to_comment',
  'get_connect_account_link',
  'list_autopilot_rules',
  'save_autopilot_rule',
  'delete_autopilot_rule',
  'run_autopilot_now',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

// ─── Contenido no confiable en la vista previa ───────────────────────────────

const UNTRUSTED_OPEN = /<untrusted_content(?:\s[^>]*)?>/gi;
const UNTRUSTED_CLOSE = /<\/untrusted_content\s*>/gi;

/**
 * Quita las etiquetas <untrusted_content> que envuelven los datos de terceros
 * (nombres, comentarios, títulos). Son para el modelo, no para la persona que
 * confirma. El resultado se pinta siempre como texto, nunca como HTML.
 */
export function stripUntrustedTags(value: string): string {
  // Las etiquetas internas que wrapUntrusted neutralizó («&lt;untrusted_content»)
  // se dejan tal cual: devolverles el «<» recrearía la etiqueta.
  return value.replace(UNTRUSTED_OPEN, '').replace(UNTRUSTED_CLOSE, '');
}

/** stripUntrustedTags aplicado en profundidad a strings, arrays y objetos. */
export function stripUntrustedDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return stripUntrustedTags(value) as T;
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripUntrustedDeep(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripUntrustedDeep(v, depth + 1);
  return out as T;
}

// ─── Registro ─────────────────────────────────────────────────────────────────

const registered: Record<'es' | 'en', Record<string, ToolSummaryFn>> = {
  es: { ...esAssistant.toolSummaries },
  en: { ...enAssistant.toolSummaries },
};

/** Registra (o reemplaza) resúmenes por idioma. */
export function registerToolSummaries(lang: 'es' | 'en', summaries: Record<string, ToolSummaryFn>): void {
  Object.assign(registered[lang], summaries);
}

/** true si el idioma tiene un resumen propio para la herramienta. */
export function hasToolSummary(name: string, lang: 'es' | 'en'): boolean {
  return typeof registered[lang][name] === 'function';
}

export function summarizeTool(
  name: string,
  lang: 'es' | 'en',
  input: unknown,
  preview: Record<string, unknown> = {},
  title?: { es: string; en: string },
): string {
  const fn = registered[lang][name];
  if (fn) {
    try {
      const text = fn(stripUntrustedDeep(input ?? {}), stripUntrustedDeep(preview ?? {}));
      if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 300);
    } catch {
      // Un resumen roto no puede bloquear la confirmación: se cae al título.
    }
  }
  return title?.[lang] ?? name;
}
