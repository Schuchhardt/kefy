// ─── Integridad de las cuentas sociales ──────────────────────────────────────
//
// Kefy guarda una referencia a la cuenta de Zernio. Esa referencia se puede
// romper sin que nada lo muestre: el id desaparece de Zernio, o apunta a otra
// cuenta y lo publicado sale en un perfil distinto del que muestra Kefy. Aquí:
// confirmar con Zernio qué cuenta se conectó, compararlas cada día y no dejar
// reglas de autopilot activas sin cuenta. Ver docs/zernio.md.

import { createSupabaseServer } from '@/lib/supabase';
import { reportError, reportWarning } from '@/lib/observability';
import { sendAutopilotAlert } from '@/lib/autopilot-alerts';
import { nextRunForRule } from '@/lib/autopilot-formats';
import type { ServiceContext } from '@/lib/services/context';
import type { ZernioAccount } from '@/types/social';

type Db = ReturnType<typeof createSupabaseServer>;

export type AccountProblem = 'missing_in_zernio' | 'account_mismatch';
export type ConnectError = 'oauth_failed' | 'account_ambiguous' | 'save_failed';

/** Una vuelta con más de esta fracción de ids perdidos parece un fallo de Zernio. */
const MAX_MISSING_RATIO = 0.5;
const MIN_ROWS_FOR_RATIO = 4;
const CONNECT_RETRY_MS = 1000;

const normalize = (name: string | null | undefined) => (name ?? '').trim().replace(/^@/, '').toLowerCase();

/** Kefy puede guardar el usuario o el nombre visible: según la red, llega uno u otro. */
export function matchesZernioAccount(label: string | null | undefined, account: Pick<ZernioAccount, 'username' | 'displayName'>): boolean {
  const name = normalize(label);
  return name !== '' && (name === normalize(account.username) || name === normalize(account.displayName));
}

// ─── Reglas de autopilot ─────────────────────────────────────────────────────

interface AccountRef {
  id: string;
  org_id: string;
  brand_id: string | null;
  platform: string | null;
  username: string | null;
}

interface RuleRow {
  id: string;
  name: string;
  created_by: string | null;
  status: 'active' | 'paused';
  paused_reason: string | null;
  social_account_ids: string[] | null;
  lost_accounts: Array<{ platform: string; username: string }> | null;
  frequency: string;
  day_of_week: number | null;
  time_of_day: string;
  timezone: string;
  format: string | null;
  weekly_formats: unknown;
}

function brandRules(db: Db, orgId: string, brandId: string | null) {
  let q = db.from('kefy_autopilot_rules').select('*').eq('org_id', orgId);
  if (brandId) q = q.eq('brand_id', brandId);
  return q;
}

/**
 * Quita la cuenta de sus reglas y recuerda cuál era, para devolvérsela al
 * reconectarla. Una regla activa que se queda sin cuentas se pausa y avisa: si
 * no, seguiría fallando en cada hueco sin que nadie lo vea.
 */
export async function detachAccountFromRules(db: Db, account: AccountRef, language: 'es' | 'en', now: Date = new Date()): Promise<number> {
  const { data } = await brandRules(db, account.org_id, account.brand_id);
  let updated = 0;
  for (const rule of (data ?? []) as RuleRow[]) {
    const ids = rule.social_account_ids ?? [];
    if (!ids.includes(account.id)) continue;

    const remaining = ids.filter((id) => id !== account.id);
    const pause = remaining.length === 0 && rule.status === 'active';
    const { error } = await db
      .from('kefy_autopilot_rules')
      .update({
        social_account_ids: remaining,
        lost_accounts: [...(rule.lost_accounts ?? []), { platform: account.platform ?? '', username: account.username ?? '' }],
        ...(pause ? { status: 'paused', paused_reason: 'no_accounts', paused_at: now.toISOString() } : {}),
      })
      .eq('id', rule.id)
      .eq('org_id', account.org_id);
    if (error) {
      reportError(new Error(error.message), { route: 'lib/services/social-integrity', service: 'supabase', extra: { ruleId: rule.id } });
      continue;
    }
    updated++;
    if (pause) {
      await sendAutopilotAlert({
        kind: 'paused_no_accounts', orgId: account.org_id, ruleId: rule.id, ruleName: rule.name, userId: rule.created_by,
        language, detail: [account.platform, account.username].filter(Boolean).join(' · '),
      });
    }
  }
  return updated;
}

/**
 * Devuelve la cuenta a las reglas de su marca que la perdieron. Solo la misma
 * cuenta (red y usuario): conectar otra distinta no debe publicar por sí sola.
 */
export async function restoreAccountToRules(db: Db, account: AccountRef, now: Date = new Date()): Promise<number> {
  const { data } = await brandRules(db, account.org_id, account.brand_id);
  const isSame = (lost: { platform: string; username: string }) =>
    lost.platform === account.platform && normalize(lost.username) === normalize(account.username);

  let restored = 0;
  for (const rule of (data ?? []) as RuleRow[]) {
    const lost = rule.lost_accounts ?? [];
    if (!lost.some(isSame)) continue;

    const resume = rule.status === 'paused' && rule.paused_reason === 'no_accounts';
    const { error } = await db
      .from('kefy_autopilot_rules')
      .update({
        social_account_ids: [...new Set([...(rule.social_account_ids ?? []), account.id])],
        lost_accounts: lost.filter((l) => !isSame(l)),
        ...(resume ? {
          status: 'active', paused_reason: null, paused_at: null,
          next_run_at: nextRunForRule(rule as never, now).toISOString(),
        } : {}),
      })
      .eq('id', rule.id)
      .eq('org_id', account.org_id);
    if (error) {
      reportError(new Error(error.message), { route: 'lib/services/social-integrity', service: 'supabase', extra: { ruleId: rule.id } });
      continue;
    }
    restored++;
  }
  return restored;
}

// ─── Conectar ────────────────────────────────────────────────────────────────

/**
 * Qué cuenta se acaba de conectar, según Zernio y solo dentro del perfil de la
 * organización: los parámetros del callback los puede escribir cualquiera. Si
 * no se puede saber con certeza no se elige ninguna; antes se guardaba la
 * primera de esa red, con el nombre de otra.
 */
export function pickConnectedAccount(
  accounts: ZernioAccount[],
  accountId: string | null,
  username: string | null,
): ZernioAccount | null {
  if (accountId) return accounts.find((a) => a.id === accountId) ?? null;
  const byName = accounts.filter((a) => matchesZernioAccount(username, a));
  if (byName.length === 1) return byName[0];
  return byName.length === 0 && accounts.length === 1 ? accounts[0] : null;
}

/** Guarda la cuenta que volvió del OAuth y le devuelve las reglas que la perdieron. */
export async function connectOAuthAccount(
  ctx: ServiceContext,
  input: { platform: string; accountId: string | null; username: string | null },
): Promise<{ ok: true } | { ok: false; error: ConnectError }> {
  const db = createSupabaseServer();
  const route = 'lib/services/social-integrity';

  const { data: org } = await db
    .from('kefy_organizations')
    .select('zernio_profile_id')
    .eq('id', ctx.auth.orgId)
    .maybeSingle();
  const profileId = (org as { zernio_profile_id?: string | null } | null)?.zernio_profile_id;
  if (!profileId) return { ok: false, error: 'oauth_failed' };

  let match: ZernioAccount | null = null;
  try {
    const { listAccounts } = await import('@/lib/zernio');
    const find = async () => pickConnectedAccount(
      await listAccounts({ profileId, platform: input.platform }), input.accountId, input.username,
    );
    match = await find();
    // Zernio puede tardar un momento en listar la cuenta recién creada.
    if (!match) {
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
      match = await find();
    }
  } catch (err) {
    reportError(err, { route, service: 'zernio', auth: ctx.auth, extra: { platform: input.platform } });
    return { ok: false, error: 'oauth_failed' };
  }

  if (!match) {
    reportWarning('OAuth callback: no se pudo confirmar la cuenta conectada', {
      route, service: 'zernio', extra: { platform: input.platform, orgId: ctx.auth.orgId, hasAccountId: Boolean(input.accountId) },
    });
    return { ok: false, error: input.accountId ? 'oauth_failed' : 'account_ambiguous' };
  }

  const { data: saved, error } = await db
    .from('kefy_social_accounts')
    .upsert(
      {
        org_id:            ctx.auth.orgId,
        brand_id:          ctx.brandId,
        platform:          input.platform,
        external_id:       match.id,
        username:          match.username || input.username || match.id,
        avatar_url:        null,
        access_token:      '',           // tokens managed by Zernio
        refresh_token:     null,
        token_expires_at:  null,
        zernio_account_id: match.id,
        status:            'active',
        status_reason:     null,
      },
      { onConflict: 'brand_id,platform,external_id' },
    )
    .select('id, org_id, brand_id, platform, username')
    .single();

  if (error || !saved) {
    reportError(new Error(error?.message ?? 'empty upsert'), { route, service: 'supabase', auth: ctx.auth });
    return { ok: false, error: 'save_failed' };
  }

  await restoreAccountToRules(db, saved as AccountRef);
  return { ok: true };
}

// ─── Comparación diaria con Zernio ───────────────────────────────────────────

interface AccountRow extends AccountRef {
  status: string;
  status_reason: AccountProblem | null;
  zernio_account_id: string;
}

export interface ReconcileResult {
  checked: number;
  revoked: Array<{ id: string; reason: AccountProblem }>;
  restored: string[];
  skipped?: 'empty_listing' | 'too_many_missing';
}

export function accountProblem(row: Pick<AccountRow, 'platform' | 'username'>, zernio: ZernioAccount | undefined): AccountProblem | null {
  if (!zernio) return 'missing_in_zernio';
  return zernio.platform === row.platform && matchesZernioAccount(row.username, zernio) ? null : 'account_mismatch';
}

/**
 * Revoca las cuentas que ya no coinciden con Zernio: así dejan de ofrecerse
 * para publicar y la interfaz dice qué pasó. Solo reactiva las que revocó ella.
 * Si el listado parece incompleto no toca nada: es preferible un día sin
 * comprobar a dejar a todos sin cuentas por un fallo pasajero.
 */
export async function reconcileSocialAccounts(now: Date = new Date()): Promise<ReconcileResult> {
  const db = createSupabaseServer();
  const route = 'lib/services/social-integrity';
  const { listAccounts } = await import('@/lib/zernio');

  const accounts = await listAccounts({ includeOverLimit: true });
  const { data, error } = await db
    .from('kefy_social_accounts')
    .select('id, org_id, brand_id, platform, username, status, status_reason, zernio_account_id')
    .not('zernio_account_id', 'is', null);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as AccountRow[]).filter((r) => r.status === 'active' || r.status_reason);
  const result: ReconcileResult = { checked: rows.length, revoked: [], restored: [] };

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const problems = rows.map((row) => ({ row, problem: accountProblem(row, byId.get(row.zernio_account_id)) }));
  const missing = problems.filter((p) => p.problem === 'missing_in_zernio').length;

  if (accounts.length === 0 && rows.length > 0) result.skipped = 'empty_listing';
  else if (rows.length >= MIN_ROWS_FOR_RATIO && missing / rows.length > MAX_MISSING_RATIO) result.skipped = 'too_many_missing';
  if (result.skipped) {
    reportWarning(`Comparación de cuentas con Zernio omitida: ${result.skipped}`, {
      route, service: 'zernio', extra: { rows: rows.length, listed: accounts.length, missing },
    });
    return result;
  }

  for (const { row, problem } of problems) {
    if (problem === row.status_reason && (problem !== null || row.status === 'active')) continue;

    const patch = problem ? { status: 'revoked', status_reason: problem } : { status: 'active', status_reason: null };
    const { error: updateError } = await db.from('kefy_social_accounts').update(patch).eq('id', row.id);
    if (updateError) {
      reportError(new Error(updateError.message), { route, service: 'supabase', extra: { accountId: row.id } });
      continue;
    }

    if (problem) {
      result.revoked.push({ id: row.id, reason: problem });
      if (row.status === 'active') await detachAccountFromRules(db, row, 'es', now);
    } else {
      result.restored.push(row.id);
      await restoreAccountToRules(db, row, now);
    }
  }

  if (result.revoked.length) {
    reportWarning('Cuentas sociales revocadas por no coincidir con Zernio', { route, service: 'zernio', extra: { revoked: result.revoked } });
  }
  return result;
}
