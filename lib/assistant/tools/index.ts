// ─── Catálogo de herramientas del asistente ──────────────────────────────────
//
// Registra una sola vez todos los módulos de herramientas. El chat, el
// servidor MCP y la API /api/v1 llaman a ensureToolsRegistered() antes de
// listar o ejecutar herramientas: así el registro no depende del orden de
// importación de cada ruta.

import { registerTools } from '@/lib/assistant/registry';
import { workspaceTools } from './workspace';
import { brandTools } from './brand';
import { strategyTools } from './strategy';
import { contentTools } from './content';
import { publishingTools } from './publishing';
import { analyticsTools } from './analytics';
import { inboxTools } from './inbox';
import { autopilotTools } from './autopilot';

// El chat reutiliza el snapshot de get_workspace_context para cada mensaje.
export { buildWorkspaceSnapshot, type WorkspaceSnapshot } from './workspace';

let registered = false;

/** Registra todas las herramientas. Idempotente: se puede llamar en cada request. */
export function ensureToolsRegistered(): void {
  if (registered) return;
  registerTools([
    ...workspaceTools,
    ...brandTools,
    ...strategyTools,
    ...contentTools,
    ...publishingTools,
    ...analyticsTools,
    ...inboxTools,
    ...autopilotTools,
  ]);
  registered = true;
}

/** Solo para tests: permite volver a registrar tras __resetRegistryForTests(). */
export function __resetToolsRegisteredForTests(): void {
  registered = false;
}

ensureToolsRegistered();
