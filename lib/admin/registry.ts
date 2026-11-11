// ─── Registro de herramientas del MCP de administración ──────────────────────
//
// Mismo patrón que lib/assistant/registry.ts, pero para la plataforma entera:
// el contexto es el admin (lib/services/admin/context.ts), no una
// organización. Las herramientas son finas y llaman a lib/services/admin/*.
//
// executeAdminTool concentra lo común:
//   1. Validación zod → invalid_input con `issues`.
//   2. Confirmación en el servidor para lo delicado (`confirm`): la primera
//      llamada NO ejecuta nada y responde { status: 'confirmation_required',
//      summary, confirmation_token }. Solo con el token (mismos argumentos, 10
//      minutos, un solo uso) se ejecuta. Por MCP no hay tarjeta de
//      confirmación: es el modelo quien tiene que preguntar al dueño.
//   3. Ejecución y auditoría en kefy_admin_audit_log de toda escritura.
//
// Ver docs/admin-mcp.md.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase';
import { reportError } from '@/lib/observability';
import { ServiceError } from '@/lib/services/errors';
import { truncateJson } from '@/lib/assistant/untrusted';
import type { AdminContext } from '@/lib/services/admin/context';

export type AdminToolKind = 'read' | 'write';

export const CONFIRMATION_TTL_SECONDS = 10 * 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AdminToolDef<S extends z.ZodObject<any>> {
  /** snake_case, único. Nombre público en MCP: no se renombra. */
  name: string;
  title: string;
  kind: AdminToolKind;
  /** En inglés, para el modelo. */
  description: string;
  input: S;
  /** Pide confirmación en el servidor antes de ejecutar. */
  confirm?: boolean;
  /** Resumen legible de lo que va a pasar (para la confirmación). */
  describe?: (ctx: AdminContext, input: z.infer<S>) => Promise<string>;
  /** Organización afectada, para la auditoría. */
  targetOrg?: (input: z.infer<S>) => string | null | undefined;
  handler: (ctx: AdminContext, input: z.infer<S>) => Promise<{ data: unknown; links?: { label: string; href: string }[] }>;
}

type AnyAdminTool = AdminToolDef<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function defineAdminTool<S extends z.ZodObject<any>>(def: AdminToolDef<S>): AdminToolDef<S> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return def;
}

const registry = new Map<string, AnyAdminTool>();

export function registerAdminTools(defs: AnyAdminTool[]): void {
  for (const def of defs) {
    if (registry.has(def.name)) throw new Error(`Herramienta admin duplicada: ${def.name}`);
    registry.set(def.name, def);
  }
}

export function getAdminTool(name: string): AnyAdminTool | undefined {
  return registry.get(name);
}

export function listAdminTools(): AnyAdminTool[] {
  return [...registry.values()];
}

/** Solo para tests. */
export function _resetAdminRegistry(): void {
  registry.clear();
}

/** JSON Schema de la entrada; las que confirman anuncian `confirmation_token`. */
export function adminToolJsonSchema(def: AnyAdminTool): Record<string, unknown> {
  const schema = z.toJSONSchema(def.input, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  if (!def.confirm) return schema;
  return {
    ...schema,
    properties: {
      ...((schema.properties as Record<string, unknown>) ?? {}),
      confirmation_token: {
        type: 'string',
        description: 'Only after the owner explicitly confirmed the summary of a previous confirmation_required response: '
          + 'repeat the call with the SAME arguments plus this token. Never reuse a token.',
      },
    },
  };
}

// ─── Confirmación sin estado ─────────────────────────────────────────────────

function confirmSecret(): string {
  const s = process.env.KEFY_ADMIN_CONFIRM_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('KEFY_ADMIN_CONFIRM_SECRET o JWT_SECRET no configurado');
  return s;
}

/** JSON con las claves ordenadas: los mismos argumentos dan la misma firma. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

function sign(ctx: AdminContext, tool: string, args: unknown, expiresAt: number): string {
  return createHmac('sha256', confirmSecret())
    .update(`kefy-admin-confirm\0${ctx.adminUserId}\0${tool}\0${canonicalJson(args)}\0${expiresAt}`)
    .digest('base64url');
}

export function issueConfirmationToken(ctx: AdminContext, tool: string, args: unknown): string {
  const expiresAt = Math.floor(ctx.now.getTime() / 1000) + CONFIRMATION_TTL_SECONDS;
  return `${expiresAt}.${sign(ctx, tool, args, expiresAt)}`;
}

export function verifyConfirmationToken(ctx: AdminContext, tool: string, args: unknown, token: string): boolean {
  const m = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const expiresAt = Number(m[1]);
  if (expiresAt <= Math.floor(ctx.now.getTime() / 1000)) return false;
  const expected = Buffer.from(sign(ctx, tool, args, expiresAt));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

export type AdminToolResult =
  | { ok: true; data: unknown; links?: { label: string; href: string }[] }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

const fail = (code: string, message: string, details?: Record<string, unknown>): AdminToolResult => ({
  ok: false, error: { code, message, ...(details ? { details } : {}) },
});

async function audit(
  ctx: AdminContext,
  def: AnyAdminTool,
  input: Record<string, unknown>,
  status: 'succeeded' | 'failed',
  error: string | null,
  confirmationHash: string | null,
): Promise<{ duplicate: boolean }> {
  const reason = typeof input.reason === 'string' ? input.reason : null;
  let targetOrg: string | null = null;
  try { targetOrg = def.targetOrg?.(input as never) ?? null; } catch { /* sin organización */ }
  const { error: dbError } = await createSupabaseServer().from('kefy_admin_audit_log').insert({
    admin_user_id: ctx.adminUserId,
    admin_email: ctx.adminEmail,
    api_key_id: ctx.apiKeyId ?? null,
    tool_name: def.name,
    input: truncateJson(input, 16384),
    reason,
    target_org_id: targetOrg,
    status,
    error,
    confirmation_hash: confirmationHash,
  });
  if (dbError) {
    if (dbError.code === '23505') return { duplicate: true };
    reportError(new Error(dbError.message), { route: `admin:${def.name}`, service: 'supabase', extra: { step: 'audit' } });
  }
  return { duplicate: false };
}

/** Reserva el token antes de ejecutar: dos llamadas con el mismo token no pasan las dos. */
async function claimConfirmation(ctx: AdminContext, def: AnyAdminTool, input: Record<string, unknown>, hash: string) {
  return audit(ctx, def, input, 'succeeded', null, hash);
}

export async function executeAdminTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: AdminContext,
): Promise<AdminToolResult | { ok: 'confirm'; summary: string; confirmation_token: string }> {
  const def = registry.get(name);
  if (!def) return fail('not_found', `Unknown tool: ${name}`);

  const { confirmation_token: token, ...args } = rawArgs;
  const parsed = def.input.safeParse(args);
  if (!parsed.success) {
    return fail('invalid_input', 'Invalid input', { issues: z.flattenError(parsed.error) as unknown as Record<string, unknown> });
  }
  const input = parsed.data as Record<string, unknown>;

  let confirmationHash: string | null = null;
  if (def.confirm) {
    if (typeof token !== 'string' || !token) {
      try {
        const summary = def.describe ? await def.describe(ctx, input) : `${def.title}: ${canonicalJson(input)}`;
        return { ok: 'confirm', summary, confirmation_token: issueConfirmationToken(ctx, def.name, input) };
      } catch (err) {
        return toFailure(err, def, ctx);
      }
    }
    if (!verifyConfirmationToken(ctx, def.name, input, token)) {
      return fail('invalid_confirmation', 'The confirmation token is invalid, expired or was issued for other arguments. Call again without it to get a new summary.');
    }
    confirmationHash = createHash('sha256').update(token).digest('hex');
    const claim = await claimConfirmation(ctx, def, input, confirmationHash);
    if (claim.duplicate) return fail('confirmation_used', 'This confirmation token was already used. Call again without it to get a new summary.');
  }

  try {
    const out = await def.handler(ctx, input);
    // Con confirmación la fila ya quedó como succeeded al reservar el token.
    if (def.kind === 'write' && !confirmationHash) await audit(ctx, def, input, 'succeeded', null, null);
    return { ok: true, data: out.data, ...(out.links?.length ? { links: out.links } : {}) };
  } catch (err) {
    const failure = toFailure(err, def, ctx);
    if (def.kind === 'write') {
      if (confirmationHash) {
        await createSupabaseServer().from('kefy_admin_audit_log')
          .update({ status: 'failed', error: failure.ok ? null : failure.error.message })
          .eq('confirmation_hash', confirmationHash);
      } else {
        await audit(ctx, def, input, 'failed', failure.ok ? null : failure.error.message, null);
      }
    }
    return failure;
  }
}

function toFailure(err: unknown, def: AnyAdminTool, ctx: AdminContext): AdminToolResult {
  if (err instanceof ServiceError) {
    if (err.status >= 500 && !err.reported) {
      reportError(err, { route: `admin:${def.name}`, extra: { code: err.code, adminUserId: ctx.adminUserId } });
    }
    return fail(err.code, err.message, err.body);
  }
  reportError(err, { route: `admin:${def.name}`, extra: { adminUserId: ctx.adminUserId } });
  return fail('provider_error', 'The tool failed. It was reported to Sentry.');
}
