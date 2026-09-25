import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safe-redirect';

// El `?next=` del login solo puede volver al dashboard del mismo idioma: todo
// lo demás sería una redirección abierta.

describe('safeNextPath', () => {
  it('acepta rutas del dashboard con su query', () => {
    expect(safeNextPath('/es/dashboard/settings?connect=instagram&brand=b1', 'es'))
      .toBe('/es/dashboard/settings?connect=instagram&brand=b1');
    expect(safeNextPath('/es/dashboard', 'es')).toBe('/es/dashboard');
  });

  it.each([
    [null],
    [''],
    ['https://evil.example/es/dashboard'],
    ['//evil.example/es/dashboard'],
    ['/\\evil.example'],
    ['/es/dashboardx'],
    ['/es/dashboard/../../login'],
    ['/en/dashboard/settings'],
    ['/es/login'],
    ['javascript:alert(1)'],
    ['/es/dashboard/\u0000x'],
  ])('rechaza %j', (next) => {
    expect(safeNextPath(next as string | null, 'es')).toBeNull();
  });
});
