import { registerAdminTools } from '@/lib/admin/registry';
import { platformTools } from '@/lib/admin/tools/platform';
import { logTools } from '@/lib/admin/tools/logs';
import { leadTools } from '@/lib/admin/tools/leads';

let registered = false;

/** Registra las herramientas del MCP de administración una sola vez. */
export function ensureAdminToolsRegistered(): void {
  if (registered) return;
  registerAdminTools([...platformTools, ...logTools, ...leadTools]);
  registered = true;
}
