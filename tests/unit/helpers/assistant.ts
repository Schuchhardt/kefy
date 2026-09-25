// ─── Datos de prueba del asistente ───────────────────────────────────────────
//
// Dos organizaciones: ORG tiene dos marcas (BRAND y BRAND_2), OTHER_ORG una.
// Los ids son UUID v4 reales porque las herramientas validan con z.uuid(),
// que es estricto con el formato.

import type { JWTPayload } from '@/types/auth';
import type { ToolContext, Scope } from '@/lib/assistant/types';
import type { FakeDb } from './fake-db';
import { subscriptionRow } from './quota';

const uuid = (n: number) => {
  const h = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
};

export const IDS = {
  ORG: uuid(1),
  OTHER_ORG: uuid(2),
  USER: uuid(10),
  USER_2: uuid(11),
  OTHER_USER: uuid(12),
  BRAND: uuid(20),
  BRAND_2: uuid(21),
  OTHER_BRAND: uuid(22),
  ARCHIVED_BRAND: uuid(23),
  KEY: uuid(30),
  uuid,
} as const;

export const AUTH: JWTPayload = { userId: IDS.USER, orgId: IDS.ORG, role: 'owner', plan: 'starter' };

/** Organizaciones, marcas, miembros y suscripciones de base. */
export function seedWorkspace(db: FakeDb): void {
  db.seed('kefy_organizations', [
    { id: IDS.ORG, name: 'Acme', plan: 'starter' },
    { id: IDS.OTHER_ORG, name: 'Otra', plan: 'pro' },
  ]);
  db.seed('kefy_brands', [
    { id: IDS.BRAND, org_id: IDS.ORG, name: 'Acme Café', archived: false, avatar_url: null },
    { id: IDS.BRAND_2, org_id: IDS.ORG, name: 'Acme Bar', archived: false, avatar_url: null },
    { id: IDS.ARCHIVED_BRAND, org_id: IDS.ORG, name: 'Vieja', archived: true, avatar_url: null },
    { id: IDS.OTHER_BRAND, org_id: IDS.OTHER_ORG, name: 'Ajena', archived: false, avatar_url: null },
  ]);
  db.seed('kefy_org_memberships', [
    { user_id: IDS.USER, org_id: IDS.ORG, role: 'owner', kefy_organizations: { name: 'Acme', plan: 'starter' } },
    { user_id: IDS.USER_2, org_id: IDS.ORG, role: 'member', kefy_organizations: { name: 'Acme', plan: 'starter' } },
    { user_id: IDS.OTHER_USER, org_id: IDS.OTHER_ORG, role: 'owner', kefy_organizations: { name: 'Otra', plan: 'pro' } },
  ]);
  seedSubscriptions(db);
}

/** Filas de kefy_subscriptions según `subscriptionState` (helpers/quota). */
export function seedSubscriptions(db: FakeDb): void {
  const t = db.rows('kefy_subscriptions');
  t.length = 0;
  const row = subscriptionRow();
  if (row) db.seed('kefy_subscriptions', [{ org_id: IDS.ORG, ...row }, { org_id: IDS.OTHER_ORG, ...row }]);
}

/** ToolContext de una API key (fuente 'api' o 'mcp'). */
export function apiCtx(over: Partial<ToolContext> & { scopes?: Scope[] } = {}): ToolContext {
  const boundBrandId = over.boundBrandId ?? null;
  return {
    auth: AUTH,
    brandId: boundBrandId ?? '',
    boundBrandId,
    language: 'en',
    brandScope: 'strict',
    orgId: IDS.ORG,
    userId: IDS.USER,
    role: 'owner',
    plan: 'starter',
    source: 'api',
    scopes: ['read', 'write', 'publish'],
    apiKeyId: IDS.KEY,
    ...over,
  };
}
