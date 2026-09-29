import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safe-redirect';

// El `?next=` del login solo puede volver al dashboard, al onboarding o a la
// invitación del mismo idioma: todo lo demás sería una redirección abierta.

describe('safeNextPath', () => {
  it('acepta rutas del dashboard con su query', () => {
    expect(safeNextPath('/es/dashboard/settings?connect=instagram&brand=b1', 'es'))
      .toBe('/es/dashboard/settings?connect=instagram&brand=b1');
    expect(safeNextPath('/es/dashboard', 'es')).toBe('/es/dashboard');
  });

  it('acepta el onboarding y la página de invitación', () => {
    expect(safeNextPath('/es/onboarding', 'es')).toBe('/es/onboarding');
    expect(safeNextPath('/es/invitacion?token=abc', 'es')).toBe('/es/invitacion?token=abc');
    expect(safeNextPath('/en/invitation?token=abc', 'en')).toBe('/en/invitation?token=abc');
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
    ['/es/invitacionx'],
    ['/es/onboarding/../precios'],
    ['/en/invitation?token=abc'],
  ])('rechaza %j', (next) => {
    expect(safeNextPath(next as string | null, 'es')).toBeNull();
  });
});
