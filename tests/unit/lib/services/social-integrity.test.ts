// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb } from '../../helpers/fake-db';
import { AUTH, IDS, seedWorkspace } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn(), reportWarning: vi.fn() }));
const alert = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/autopilot-alerts', () => ({ sendAutopilotAlert: alert }));
const zernio = vi.hoisted(() => ({ listAccounts: vi.fn(), disconnectAccount: vi.fn() }));
vi.mock('@/lib/zernio', () => zernio);
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));
vi.mock('@/lib/auth', async (original) => ({ ...(await original<typeof import('@/lib/auth')>()), verifyAccessToken: auth.verifyAccessToken }));
vi.mock('@/lib/brands', () => ({ getBrandFromRequest: vi.fn(async () => ({ brand: { id: IDS.BRAND } })) }));

import { GET as callback } from '@/app/api/social/oauth/callback/route';
import { GET as reconcileRoute } from '@/app/api/social/accounts/reconcile/route';
import { ACCESS_COOKIE } from '@/lib/auth';
import { serviceContext } from '@/lib/services/context';
import { disconnectSocialAccount, listSocialAccounts } from '@/lib/services/social';
import {
  accountProblem, connectOAuthAccount, matchesZernioAccount, pickConnectedAccount, reconcileSocialAccounts,
} from '@/lib/services/social-integrity';
import type { ZernioAccount } from '@/types/social';

const ctx = serviceContext(AUTH, IDS.BRAND, 'es', { brandScope: 'strict', source: 'route' });
const PROFILE = 'profile-1';
const ACC = IDS.uuid(700);
const RULE = IDS.uuid(710);

const zAccount = (id: string, username: string, extra: Partial<ZernioAccount> = {}) =>
  ({ id, platform: 'instagram', username, ...extra }) as ZernioAccount;
const accounts = () => db.rows('kefy_social_accounts');
const rule = () => db.rows('kefy_autopilot_rules')[0];

function seedAccount(row: Record<string, unknown> = {}) {
  db.seed('kefy_social_accounts', [{
    id: ACC, org_id: IDS.ORG, brand_id: IDS.BRAND, platform: 'instagram', username: 'acme', status: 'active',
    status_reason: null, zernio_account_id: 'z-1', external_id: 'z-1', created_at: '2026-01-01T00:00:00Z', ...row,
  }]);
}

function seedRule(row: Record<string, unknown> = {}) {
  db.seed('kefy_autopilot_rules', [{
    id: RULE, org_id: IDS.ORG, brand_id: IDS.BRAND, name: 'Diaria', created_by: null, status: 'active', paused_reason: null,
    social_account_ids: [ACC], lost_accounts: [], frequency: 'daily', day_of_week: null, time_of_day: '12:00:00',
    timezone: 'America/Santiago', format: null, weekly_formats: null, next_run_at: '2026-11-06T15:00:00Z', ...row,
  }]);
}

beforeEach(() => {
  db.reset();
  seedWorkspace(db);
  db.rows('kefy_organizations').forEach((o) => { o.zernio_profile_id = PROFILE; });
  alert.mockClear();
  zernio.listAccounts.mockReset();
  zernio.disconnectAccount.mockReset().mockResolvedValue(undefined);
});

describe('elegir la cuenta conectada', () => {
  const two = [zAccount('a', 'acme'), zAccount('b', 'otra')];

  it('compara usuario y nombre visible, sin arroba ni mayúsculas', () => {
    expect(matchesZernioAccount('@ACME', zAccount('a', 'acme'))).toBe(true);
    expect(matchesZernioAccount('M3GA', zAccount('a', 'M3GAsoluciones', { displayName: 'M3GA' }))).toBe(true);
    expect(matchesZernioAccount('', zAccount('a', ''))).toBe(false);
  });

  it('con id, solo esa cuenta del perfil', () => {
    expect(pickConnectedAccount(two, 'b', 'acme')?.id).toBe('b');
    expect(pickConnectedAccount(two, 'de-otro-perfil', 'acme')).toBeNull();
  });

  it('sin id y sin coincidencia con varias cuentas, no elige ninguna (antes: accounts[0])', () => {
    expect(pickConnectedAccount(two, null, 'acme')?.id).toBe('a');
    expect(pickConnectedAccount(two, null, 'no-esta')).toBeNull();
    expect(pickConnectedAccount(two, null, null)).toBeNull();
    expect(pickConnectedAccount([two[1]], null, null)?.id).toBe('b');
  });
});

describe('connectOAuthAccount', () => {
  it('guarda el usuario que dice Zernio, no el del callback', async () => {
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'real')]);
    const out = await connectOAuthAccount(ctx, { platform: 'instagram', accountId: 'z-9', username: 'falso' });
    expect(out).toEqual({ ok: true });
    expect(zernio.listAccounts).toHaveBeenCalledWith({ profileId: PROFILE, platform: 'instagram' });
    expect(accounts()[0]).toMatchObject({ username: 'real', zernio_account_id: 'z-9', status: 'active', brand_id: IDS.BRAND });
  });

  it('un id que no es del perfil de la organización no se guarda', async () => {
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'real')]);
    const out = await connectOAuthAccount(ctx, { platform: 'instagram', accountId: 'ajeno', username: 'x' });
    expect(out).toEqual({ ok: false, error: 'oauth_failed' });
    expect(zernio.listAccounts).toHaveBeenCalledTimes(2);
    expect(accounts()).toHaveLength(0);
  });

  it('sin certeza no guarda nada', async () => {
    zernio.listAccounts.mockResolvedValue([zAccount('a', 'uno'), zAccount('b', 'dos')]);
    const out = await connectOAuthAccount(ctx, { platform: 'instagram', accountId: null, username: 'tres' });
    expect(out).toEqual({ ok: false, error: 'account_ambiguous' });
    expect(accounts()).toHaveLength(0);
  });

  it('reconectar la misma cuenta devuelve la regla y la reanuda con el calendario al día', async () => {
    seedRule({ status: 'paused', paused_reason: 'no_accounts', social_account_ids: [], lost_accounts: [{ platform: 'instagram', username: '@Acme' }], next_run_at: '2026-01-01T00:00:00Z' });
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'acme')]);
    await connectOAuthAccount(ctx, { platform: 'instagram', accountId: 'z-9', username: 'acme' });
    expect(rule()).toMatchObject({ status: 'active', paused_reason: null, social_account_ids: [accounts()[0].id], lost_accounts: [] });
    expect(new Date(rule().next_run_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('conectar otra cuenta de la misma red no toca la regla', async () => {
    seedRule({ status: 'paused', paused_reason: 'no_accounts', social_account_ids: [], lost_accounts: [{ platform: 'instagram', username: 'acme' }] });
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'otra')]);
    await connectOAuthAccount(ctx, { platform: 'instagram', accountId: 'z-9', username: 'otra' });
    expect(rule()).toMatchObject({ status: 'paused', social_account_ids: [] });
  });

  it('una regla pausada a mano recupera la cuenta, pero sigue pausada', async () => {
    seedRule({ status: 'paused', social_account_ids: [], lost_accounts: [{ platform: 'instagram', username: 'acme' }] });
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'acme')]);
    await connectOAuthAccount(ctx, { platform: 'instagram', accountId: 'z-9', username: 'acme' });
    expect(rule().status).toBe('paused');
    expect(rule().social_account_ids).toHaveLength(1);
  });
});

describe('callback de OAuth', () => {
  const call = (qs: string) => {
    auth.verifyAccessToken.mockResolvedValue(AUTH);
    return callback(new NextRequest(`http://localhost/api/social/oauth/callback?${qs}`, { headers: { cookie: `${ACCESS_COOKIE}=t` } }));
  };

  it('redirige con el error si no puede confirmar la cuenta', async () => {
    zernio.listAccounts.mockResolvedValue([zAccount('a', 'uno'), zAccount('b', 'dos')]);
    const res = await call('connected=instagram&username=tres');
    expect(res.headers.get('location')).toContain('error=account_ambiguous');
  });

  it('el profileId de la URL no se usa', async () => {
    zernio.listAccounts.mockResolvedValue([zAccount('z-9', 'real')]);
    const res = await call('connected=instagram&accountId=z-9&profileId=de-otro');
    expect(res.headers.get('location')).toContain('connected=instagram');
    expect(zernio.listAccounts).toHaveBeenCalledWith({ profileId: PROFILE, platform: 'instagram' });
  });
});

describe('disconnectSocialAccount', () => {
  it('pausa la regla que se queda sin cuentas, avisa y recuerda la cuenta', async () => {
    seedAccount();
    seedRule();
    const out = await disconnectSocialAccount(ctx, ACC);
    expect(out.autopilot_rules_updated).toBe(1);
    expect(rule()).toMatchObject({
      status: 'paused', paused_reason: 'no_accounts', social_account_ids: [], lost_accounts: [{ platform: 'instagram', username: 'acme' }],
    });
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'paused_no_accounts', ruleId: RULE }));
  });

  it('con otra cuenta en la regla, sigue activa', async () => {
    seedAccount();
    seedRule({ social_account_ids: [ACC, IDS.uuid(701)] });
    await disconnectSocialAccount(ctx, ACC);
    expect(rule()).toMatchObject({ status: 'active', social_account_ids: [IDS.uuid(701)] });
    expect(alert).not.toHaveBeenCalled();
  });

  it('no revoca en Zernio un id que usa otra fila', async () => {
    seedAccount();
    seedAccount({ id: IDS.uuid(702), username: 'otra', external_id: 'z-1b' });
    await disconnectSocialAccount(ctx, ACC);
    expect(zernio.disconnectAccount).not.toHaveBeenCalled();
    expect(accounts().map((a) => a.id)).toEqual([IDS.uuid(702)]);
  });

  it('un id que nadie más usa sí se revoca', async () => {
    seedAccount();
    await disconnectSocialAccount(ctx, ACC);
    expect(zernio.disconnectAccount).toHaveBeenCalledWith('z-1');
  });
});

describe('reconcileSocialAccounts', () => {
  it('detecta un id ausente y uno que es de otra cuenta', () => {
    const row = { platform: 'instagram', username: 'acme' };
    expect(accountProblem(row, undefined)).toBe('missing_in_zernio');
    expect(accountProblem(row, zAccount('z', 'otra'))).toBe('account_mismatch');
    expect(accountProblem(row, zAccount('z', 'acme', { platform: 'tiktok' as never }))).toBe('account_mismatch');
    expect(accountProblem(row, zAccount('z', 'acme'))).toBeNull();
  });

  it('revoca con motivo, pausa la regla y no toca las que coinciden', async () => {
    seedAccount();
    seedAccount({ id: IDS.uuid(703), username: 'bien', zernio_account_id: 'z-2', external_id: 'z-2' });
    seedRule();
    zernio.listAccounts.mockResolvedValue([zAccount('z-1', 'de-otro'), zAccount('z-2', 'bien')]);

    const out = await reconcileSocialAccounts();

    expect(zernio.listAccounts).toHaveBeenCalledWith({ includeOverLimit: true });
    expect(out.revoked).toEqual([{ id: ACC, reason: 'account_mismatch' }]);
    expect(accounts().find((a) => a.id === ACC)).toMatchObject({ status: 'revoked', status_reason: 'account_mismatch' });
    expect(accounts().find((a) => a.id === IDS.uuid(703))).toMatchObject({ status: 'active', status_reason: null });
    expect(rule()).toMatchObject({ status: 'paused', paused_reason: 'no_accounts', social_account_ids: [] });
  });

  it('es idempotente: la segunda vuelta no vuelve a revocar ni avisar', async () => {
    seedAccount();
    seedAccount({ id: IDS.uuid(703), username: 'bien', zernio_account_id: 'z-2', external_id: 'z-2' });
    seedRule();
    zernio.listAccounts.mockResolvedValue([zAccount('z-2', 'bien')]);
    await reconcileSocialAccounts();
    alert.mockClear();
    const out = await reconcileSocialAccounts();
    expect(out.revoked).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
  });

  it('si la cuenta vuelve a coincidir, la reactiva y le devuelve la regla', async () => {
    seedAccount({ status: 'revoked', status_reason: 'missing_in_zernio' });
    seedRule({ status: 'paused', paused_reason: 'no_accounts', social_account_ids: [], lost_accounts: [{ platform: 'instagram', username: 'acme' }] });
    zernio.listAccounts.mockResolvedValue([zAccount('z-1', 'acme')]);
    const out = await reconcileSocialAccounts();
    expect(out.restored).toEqual([ACC]);
    expect(accounts()[0]).toMatchObject({ status: 'active', status_reason: null });
    expect(rule()).toMatchObject({ status: 'active', social_account_ids: [ACC] });
  });

  it('no reactiva lo que revocó otro (webhook de Zernio)', async () => {
    seedAccount({ status: 'revoked', status_reason: null });
    zernio.listAccounts.mockResolvedValue([zAccount('z-1', 'acme')]);
    await reconcileSocialAccounts();
    expect(accounts()[0].status).toBe('revoked');
  });

  it('un listado vacío o con casi todo ausente no toca nada', async () => {
    seedAccount();
    zernio.listAccounts.mockResolvedValue([]);
    expect((await reconcileSocialAccounts()).skipped).toBe('empty_listing');
    expect(accounts()[0].status).toBe('active');

    for (let i = 1; i <= 4; i++) seedAccount({ id: IDS.uuid(720 + i), zernio_account_id: `y-${i}`, external_id: `y-${i}` });
    zernio.listAccounts.mockResolvedValue([zAccount('otra', 'otra')]);
    expect((await reconcileSocialAccounts()).skipped).toBe('too_many_missing');
    expect(accounts().every((a) => a.status === 'active')).toBe(true);
  });

  it('el cron exige el secreto', async () => {
    vi.stubEnv('CRON_SECRET', 's3');
    const res = await reconcileRoute(new NextRequest('http://localhost/api/social/accounts/reconcile'));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });
});

describe('listSocialAccounts', () => {
  it('oculta la fila revocada si esa cuenta ya se reconectó, y muestra el motivo si no', async () => {
    seedAccount({ status: 'revoked', status_reason: 'missing_in_zernio' });
    let out = await listSocialAccounts(ctx);
    expect(out.accounts[0]).toMatchObject({ status_reason: 'missing_in_zernio' });

    seedAccount({ id: IDS.uuid(704), zernio_account_id: 'z-5', external_id: 'z-5' });
    out = await listSocialAccounts(ctx);
    expect(out.accounts.map((a) => a.id)).toEqual([IDS.uuid(704)]);
  });
});
