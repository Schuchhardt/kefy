import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '../../helpers/fake-db';

// Editar las escenas de un reel con guion de video no puede perder a qué
// plano corresponde cada una (scene_id): sin eso, al producir, borrar la
// escena 2 le ponía a la 3 el personaje y el lipsync de la 2.

const db = createFakeDb();
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => db.client }));

import { updateContent } from '@/lib/services/content';
import { serviceContext } from '@/lib/services/context';

const ctx = serviceContext({ userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' } as never, 'brand-1');

beforeEach(() => {
  db.reset();
  db.seed('kefy_content_items', [{ id: 'item-1', org_id: 'org-1', brand_id: 'brand-1', content_type: 'reel', slides: [], metadata: {} }]);
});

describe('updateContent: escenas de reel con guion', () => {
  it('conserva scene_id, image_prompt y text_baked', async () => {
    await updateContent(ctx, 'item-1', {
      slides: [
        { scene_order: 1, scene_id: 's3', title: 'A', body: 'a', image_url: 'https://x/a.jpg', image_prompt: 'p', text_baked: false },
        { scene_order: 2, title: 'B', body: 'b' },
      ],
    });
    const slides = db.find('kefy_content_items', (r) => r.id === 'item-1')!.slides as Array<Record<string, unknown>>;
    expect(slides[0]).toMatchObject({ scene_id: 's3', image_prompt: 'p', text_baked: false });
    expect(slides[1]).not.toHaveProperty('scene_id');
  });

  it('descarta un scene_id con forma rara', async () => {
    await updateContent(ctx, 'item-1', { slides: [{ scene_order: 1, scene_id: '../../x', title: 'A', body: 'a' }] });
    const slides = db.find('kefy_content_items', (r) => r.id === 'item-1')!.slides as Array<Record<string, unknown>>;
    expect(slides[0]).not.toHaveProperty('scene_id');
  });
});
