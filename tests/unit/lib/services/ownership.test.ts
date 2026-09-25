// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';
import { IDS, AUTH } from '../../helpers/assistant';

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));

import {
  loadOwnedItem, loadOwnedAccount, loadOwnedComment, loadOwnedScheduledPost,
} from '@/lib/services/ownership';
import { serviceContext } from '@/lib/services/context';
import { ServiceError } from '@/lib/services/errors';

// createSupabaseServer es service-role sin RLS: estos helpers son lo único que
// impide leer el recurso de otra organización (o, con 'strict', de otra marca
// de la misma organización, que es lo que protege a una API key atada).

const strict = serviceContext(AUTH, IDS.BRAND, 'es', { brandScope: 'strict', source: 'api' });
const orgScope = serviceContext(AUTH, IDS.BRAND, 'es');

const ITEM = IDS.uuid(200);
const ITEM_OTHER_BRAND = IDS.uuid(201);
const ITEM_OTHER_ORG = IDS.uuid(202);

beforeEach(() => {
  db.reset();
  db.seed('kefy_content_items', [
    { id: ITEM, org_id: IDS.ORG, brand_id: IDS.BRAND, title: 'Mío' },
    { id: ITEM_OTHER_BRAND, org_id: IDS.ORG, brand_id: IDS.BRAND_2, title: 'Otra marca' },
    { id: ITEM_OTHER_ORG, org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, title: 'Ajeno' },
  ]);
  db.seed('kefy_social_accounts', [
    { id: IDS.uuid(300), org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'active' },
    { id: IDS.uuid(301), org_id: IDS.ORG, brand_id: IDS.BRAND_2, status: 'active' },
    { id: IDS.uuid(302), org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND, status: 'active' },
    { id: IDS.uuid(303), org_id: IDS.ORG, brand_id: IDS.BRAND, status: 'disconnected' },
  ]);
  db.seed('kefy_comments', [
    { id: IDS.uuid(400), org_id: IDS.ORG, brand_id: IDS.BRAND },
    { id: IDS.uuid(401), org_id: IDS.ORG, brand_id: IDS.BRAND_2 },
    { id: IDS.uuid(402), org_id: IDS.OTHER_ORG, brand_id: IDS.OTHER_BRAND },
  ]);
});

async function notFound(p: Promise<unknown>) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).status).toBe(404);
  return err as ServiceError;
}

describe('loadOwnedItem', () => {
  it('carga el contenido de la marca del contexto', async () => {
    expect((await loadOwnedItem(strict, ITEM)).title).toBe('Mío');
  });

  it('el contenido de otra organización es 404 en cualquier modo', async () => {
    await notFound(loadOwnedItem(strict, ITEM_OTHER_ORG));
    await notFound(loadOwnedItem(orgScope, ITEM_OTHER_ORG));
  });

  it("con 'strict' el contenido de otra marca de la misma organización es 404", async () => {
    await notFound(loadOwnedItem(strict, ITEM_OTHER_BRAND));
  });

  it("con 'org' (rutas de la UI) se mantiene el comportamiento de hoy: otra marca de la org sí se carga", async () => {
    expect((await loadOwnedItem(orgScope, ITEM_OTHER_BRAND)).title).toBe('Otra marca');
  });

  it('usa el mensaje 404 pedido', async () => {
    const err = await notFound(loadOwnedItem(strict, ITEM_OTHER_ORG, '*', 'Content item not found'));
    expect(err.message).toBe('Content item not found');
  });
});

describe('loadOwnedAccount', () => {
  it('cuenta de otra marca (strict) u otra organización → 404', async () => {
    expect((await loadOwnedAccount(strict, IDS.uuid(300))).id).toBe(IDS.uuid(300));
    await notFound(loadOwnedAccount(strict, IDS.uuid(301)));
    await notFound(loadOwnedAccount(strict, IDS.uuid(302)));
    await notFound(loadOwnedAccount(orgScope, IDS.uuid(302)));
  });

  it('activeOnly rechaza una cuenta desconectada', async () => {
    const err = await notFound(loadOwnedAccount(strict, IDS.uuid(303), { activeOnly: true }));
    expect(err.message).toMatch(/inactive/);
    expect((await loadOwnedAccount(strict, IDS.uuid(303))).id).toBe(IDS.uuid(303));
  });
});

describe('loadOwnedComment', () => {
  it('comentario de otra marca (strict) u otra organización → 404', async () => {
    expect((await loadOwnedComment(strict, IDS.uuid(400))).id).toBe(IDS.uuid(400));
    await notFound(loadOwnedComment(strict, IDS.uuid(401)));
    await notFound(loadOwnedComment(strict, IDS.uuid(402)));
  });
});

describe('loadOwnedScheduledPost', () => {
  const POST = IDS.uuid(500);

  function seedPost(row: Record<string, unknown>) {
    db.seed('kefy_scheduled_posts', [{ id: POST, org_id: IDS.ORG, status: 'scheduled', ...row }]);
  }

  it('acepta una fila con el brand_id del contexto', async () => {
    seedPost({ brand_id: IDS.BRAND, kefy_content_items: { brand_id: IDS.BRAND } });
    expect((await loadOwnedScheduledPost(strict, POST)).id).toBe(POST);
  });

  it('rechaza una fila de otra marca', async () => {
    seedPost({ brand_id: IDS.BRAND_2, kefy_content_items: { brand_id: IDS.BRAND_2 } });
    await notFound(loadOwnedScheduledPost(strict, POST));
  });

  it('fila antigua sin brand_id: decide la marca de su contenido', async () => {
    seedPost({ brand_id: null, kefy_content_items: [{ brand_id: IDS.BRAND }] });
    const post = await loadOwnedScheduledPost(strict, POST);
    // La relación llega normalizada a objeto aunque PostgREST la dé como array.
    expect(post.kefy_content_items).toEqual({ brand_id: IDS.BRAND });
  });

  it('fila antigua sin brand_id cuyo contenido es de otra marca → 404', async () => {
    seedPost({ brand_id: null, kefy_content_items: { brand_id: IDS.BRAND_2 } });
    await notFound(loadOwnedScheduledPost(strict, POST));
  });

  it('una fila de otra organización es 404 aunque sea de "la misma" marca', async () => {
    seedPost({ org_id: IDS.OTHER_ORG, brand_id: IDS.BRAND, kefy_content_items: { brand_id: IDS.BRAND } });
    await notFound(loadOwnedScheduledPost(strict, POST));
    await notFound(loadOwnedScheduledPost(orgScope, POST));
  });

  it('un error de la base es un 500 ya reportado, no un 404', async () => {
    db.failNext('kefy_scheduled_posts', 'select');
    const err = await loadOwnedScheduledPost(strict, POST).then(() => null, (e) => e as ServiceError);
    expect(err?.status).toBe(500);
    expect(err?.reported).toBe(true);
  });
});
