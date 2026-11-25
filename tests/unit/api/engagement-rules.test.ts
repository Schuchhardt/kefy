import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Las reglas de engagement responden en público desde las cuentas de la marca.
// La herramienta del asistente, /rules/bulk y autopilot ya exigían owner/admin;
// las rutas de crear, editar y borrar una regla no.

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getAuthFromRequest: vi.fn() };
});
vi.mock('@/lib/brands', () => ({
  getBrandFromRequest: vi.fn(async () => ({ brand: { id: 'brand-1' }, setCookieHeader: null })),
}));
const svc = vi.hoisted(() => ({
  createEngagementRule: vi.fn(async () => ({ id: 'r-1' })),
  updateEngagementRule: vi.fn(async () => ({ id: 'r-1' })),
  deleteEngagementRule: vi.fn(async () => undefined),
  listEngagementRules: vi.fn(async () => []),
}));
vi.mock('@/lib/services/engagement', () => svc);

import { getAuthFromRequest } from '@/lib/auth';

const admin  = { userId: 'u-admin', orgId: 'org-1', role: 'admin', plan: 'business' };
const member = { userId: 'u-member', orgId: 'org-1', role: 'member', plan: 'business' };

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost:3099/api/automations/engagement/rules/r-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = { params: Promise.resolve({ id: 'r-1' }) };

beforeEach(() => { vi.clearAllMocks(); });

describe('reglas de engagement — permisos', () => {
  it('un miembro no puede crear reglas', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(member as never);
    const { POST } = await import('@/app/api/automations/engagement/rules/route');

    expect((await POST(req('POST', { name: 'x' }))).status).toBe(403);
    expect(svc.createEngagementRule).not.toHaveBeenCalled();
  });

  it('un miembro no puede editar ni borrar reglas', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(member as never);
    const { PATCH, DELETE } = await import('@/app/api/automations/engagement/rules/[id]/route');

    expect((await PATCH(req('PATCH', { is_active: false }), params)).status).toBe(403);
    expect((await DELETE(req('DELETE'), params)).status).toBe(403);
    expect(svc.updateEngagementRule).not.toHaveBeenCalled();
    expect(svc.deleteEngagementRule).not.toHaveBeenCalled();
  });

  it('un miembro sí puede ver las reglas', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(member as never);
    const { GET } = await import('@/app/api/automations/engagement/rules/route');

    expect((await GET(req('GET'))).status).toBe(200);
  });

  it('un administrador crea, edita y borra', async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(admin as never);
    const { POST } = await import('@/app/api/automations/engagement/rules/route');
    const { PATCH, DELETE } = await import('@/app/api/automations/engagement/rules/[id]/route');

    expect((await POST(req('POST', { name: 'x' }))).status).toBe(201);
    expect((await PATCH(req('PATCH', { is_active: false }), params)).status).toBe(200);
    expect((await DELETE(req('DELETE'), params)).status).toBe(200);
  });
});
