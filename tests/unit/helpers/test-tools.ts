// ─── Herramientas de prueba para las rutas del asistente ─────────────────────
//
// Las rutas (MCP, /api/v1, chat) registran el catálogo real con
// ensureToolsRegistered(). Para probar el transporte sin depender de los
// servicios reales se añaden estas herramientas al mismo registro:
//
//   test_echo    — lectura; devuelve su entrada y un enlace relativo.
//   test_write   — escritura sin confirmación.
//   test_publish — publicación; en el chat siempre pide confirmación.
//   test_limited — escritura que falla con un 429 con Retry-After.
//
// `testToolCalls` registra cada ejecución.

import { z } from 'zod';
import { defineTool, getTool, registerTools } from '@/lib/assistant/registry';
import { ServiceError } from '@/lib/services/errors';
import type { ToolContext } from '@/lib/assistant/types';

export const testToolCalls: Array<{ name: string; input: unknown; brandId: string; source: string }> = [];

const rec = (name: string, ctx: ToolContext, input: unknown) => {
  testToolCalls.push({ name, input, brandId: ctx.brandId, source: ctx.source });
};

const tools = [
  defineTool({
    name: 'test_echo', kind: 'read', description: 'Echoes its input.', confirm: 'never',
    title: { es: 'Eco', en: 'Echo' },
    input: z.object({ text: z.string().max(100) }).strict(),
    handler: async (ctx, input) => {
      rec('test_echo', ctx, input);
      return {
        data: { echo: input.text, brand_id: ctx.brandId },
        links: [{ label: 'Open', href: `/${ctx.language}/dashboard/content/create` }],
      };
    },
  }),
  defineTool({
    name: 'test_write', kind: 'write', description: 'Writes.', confirm: 'never',
    input: z.object({ text: z.string().min(1) }).strict(),
    handler: async (ctx, input) => {
      rec('test_write', ctx, input);
      return { data: { saved: input.text }, dataChanged: ['content'] };
    },
  }),
  defineTool({
    name: 'test_publish', kind: 'publish', description: 'Publishes.', confirm: 'always',
    title: { es: 'Publicar prueba', en: 'Test publish' },
    input: z.object({ text: z.string().min(1) }).strict(),
    describe: async (_ctx, input) => ({ text: input.text }),
    handler: async (ctx, input) => {
      rec('test_publish', ctx, input);
      return { data: { published: input.text }, dataChanged: ['scheduled'] };
    },
  }),
  defineTool({
    name: 'test_limited', kind: 'write', description: 'Always rate limited.', confirm: 'never',
    input: z.object({}).strict(),
    handler: async () => {
      throw new ServiceError('rate_limited', 429, 'Slow down', { error: 'Slow down', retryAfter: 7 }, { 'Retry-After': '7' });
    },
  }),
];

/** Registra las herramientas de prueba una sola vez por módulo de registro. */
export function registerTestTools(): void {
  if (getTool('test_echo')) return;
  registerTools(tools);
}
