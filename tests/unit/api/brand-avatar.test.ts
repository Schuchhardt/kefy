import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSupabaseClient = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({ createSupabaseServer: () => mockSupabaseClient }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});

vi.mock('@/lib/storage', () => ({
  uploadBase64Image: vi.fn().mockResolvedValue('https://cdn/brand-avatar.webp'),
}));

// Sharp normaliza la imagen a un cuadrado; aquí solo interesa que la ruta lo
// invoque y suba el resultado, no el redimensionado en sí.
vi.mock('sharp', () => {
  const chain = {
    rotate: vi.fn(() => chain),
    resize: vi.fn(() => chain),
    webp: vi.fn(() => chain),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('imagen-normalizada')),
  };
  return { default: vi.fn(() => chain) };
});

import { getAuthFromRequest } from '@/lib/auth';
import { uploadBase64Image } from '@/lib/storage';
import sharp from 'sharp';

const auth = { userId: 'u1', orgId: 'org-1', role: 'owner', plan: 'pro' };

function uploadReq(tipo = 'image/png', bytes = 1024) {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(bytes)], 'logo.png', { type: tipo }));
  return new NextRequest('http://localhost:3099/api/brands/b1/avatar', {
    method: 'POST',
    body: fd,
  });
}

const params = { params: Promise.resolve({ id: 'b1' }) };

/** La marca existe y pertenece a la organización; el update devuelve la fila. */
function setupBrand(existe = true) {
  mockSupabaseClient.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'update']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: existe
        ? { id: 'b1', org_id: 'org-1', name: 'Acme', avatar_url: 'https://cdn/brand-avatar.webp' }
        : null,
      error: null,
    });
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthFromRequest).mockResolvedValue(auth as never);
  vi.mocked(uploadBase64Image).mockResolvedValue('https://cdn/brand-avatar.webp');
});

describe('POST /api/brands/[id]/avatar', () => {
  it('devuelve 401 sin sesión', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    expect((await POST(uploadReq(), params)).status).toBe(401);
  });

  // El filtro por org_id es lo que impide cambiarle la imagen a la marca de
  // otra organización conociendo su id.
  it('devuelve 404 si la marca no es de la organización', async () => {
    setupBrand(false);
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    expect((await POST(uploadReq(), params)).status).toBe(404);
  });

  it('rechaza un formato no admitido', async () => {
    setupBrand();
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    const res = await POST(uploadReq('image/gif'), params);
    expect(res.status).toBe(422);
    expect(uploadBase64Image).not.toHaveBeenCalled();
  });

  it('rechaza una imagen de más de 5 MB', async () => {
    setupBrand();
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    const res = await POST(uploadReq('image/png', 6 * 1024 * 1024), params);
    expect(res.status).toBe(422);
    expect(uploadBase64Image).not.toHaveBeenCalled();
  });

  it('sube la imagen y devuelve la marca actualizada', async () => {
    setupBrand();
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    const res = await POST(uploadReq(), params);

    expect(res.status).toBe(200);
    expect((await res.json()).brand.avatar_url).toBe('https://cdn/brand-avatar.webp');
    expect(uploadBase64Image).toHaveBeenCalledTimes(1);
  });

  // Se guarda cuadrada porque el selector la pinta redondeada: una imagen
  // alargada saldría recortada de forma impredecible.
  it('normaliza la imagen a un cuadrado y aplica la orientación EXIF', async () => {
    setupBrand();
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    await POST(uploadReq(), params);

    const instancia = vi.mocked(sharp).mock.results[0].value;
    expect(instancia.rotate).toHaveBeenCalled();
    const [ancho, alto, opts] = instancia.resize.mock.calls[0];
    expect(ancho).toBe(alto);
    expect(opts.fit).toBe('cover');
  });

  it('rechaza una petición sin archivo', async () => {
    setupBrand();
    const { POST } = await import('@/app/api/brands/[id]/avatar/route');

    const req = new NextRequest('http://localhost:3099/api/brands/b1/avatar', {
      method: 'POST', body: new FormData(),
    });
    expect((await POST(req, params)).status).toBe(422);
  });
});

describe('DELETE /api/brands/[id]/avatar', () => {
  it('deja el avatar en null para volver al logo del kit', async () => {
    let guardado: Record<string, unknown> | null = null;
    mockSupabaseClient.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((v: Record<string, unknown>) => { guardado = v; return chain; });
      chain.eq = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'b1', avatar_url: null }, error: null,
      });
      return chain;
    });

    const { DELETE } = await import('@/app/api/brands/[id]/avatar/route');
    const req = new NextRequest('http://localhost:3099/api/brands/b1/avatar', { method: 'DELETE' });

    const res = await DELETE(req, params);

    expect(res.status).toBe(200);
    expect(guardado).toEqual({ avatar_url: null });
  });

  it('devuelve 401 sin sesión', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/brands/[id]/avatar/route');
    const req = new NextRequest('http://localhost:3099/api/brands/b1/avatar', { method: 'DELETE' });

    expect((await DELETE(req, params)).status).toBe(401);
  });
});
